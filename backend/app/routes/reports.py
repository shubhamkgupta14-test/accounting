from collections import defaultdict

from fastapi import APIRouter, Depends

from app.core.database import get_database
from app.dependencies import get_current_user
from app.accounting import accounts_with_balances
from app.utils import serialize_many
from app.pagination import PageParams, page_response

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/dashboard")
async def dashboard(_: dict = Depends(get_current_user)):
    db = get_database()
    accounts = await accounts_with_balances(db)
    journals = await db.journal_entries.find({}).sort("date", -1).limit(5).to_list(5)
    posted = await db.journal_entries.find({"status": "Posted"}, {"date": 1, "entries": 1}).sort("date", 1).to_list(length=None)
    account_types = {account["name"]: account.get("type") for account in accounts}
    cash_bank_names = {
        account["name"] for account in accounts
        if "cash" in account["name"].lower() or account.get("group", "").lower() == "bank"
    }
    monthly = defaultdict(lambda: {"revenue": 0.0, "expenses": 0.0, "inflow": 0.0, "outflow": 0.0})
    expense_breakdown = defaultdict(float)
    sales = 0.0
    purchases = 0.0
    for journal in posted:
        key = str(journal.get("date", ""))[:7]
        if not key:
            continue
        for line in journal.get("entries", []):
            name = line.get("account", "")
            debit = float(line.get("debit", 0) or 0)
            credit = float(line.get("credit", 0) or 0)
            if name == "Sales":
                sales += credit
            if name == "Purchases":
                purchases += debit
            if account_types.get(name) == "Income":
                monthly[key]["revenue"] += credit - debit
            if account_types.get(name) == "Expense":
                monthly[key]["expenses"] += debit - credit
                expense_breakdown[name] += debit
            if name in cash_bank_names:
                monthly[key]["inflow"] += debit
                monthly[key]["outflow"] += credit
    manual_transactions = await db.transactions.find({}, {"date": 1, "debit": 1, "credit": 1}).to_list(length=None)
    for transaction in manual_transactions:
        key = str(transaction.get("date", ""))[:7]
        if key:
            monthly[key]["inflow"] += float(transaction.get("debit", 0) or 0)
            monthly[key]["outflow"] += float(transaction.get("credit", 0) or 0)

    def total_by(names: set[str]) -> float:
        return sum(a.get("balance", 0) for a in accounts if a.get("name") in names or a.get("group") in names)

    total_income = sum(a.get("balance", 0) for a in accounts if a.get("type") == "Income")
    total_expenses = sum(a.get("balance", 0) for a in accounts if a.get("type") == "Expense")
    return {
        "stats": {
            "cash": total_by({"Cash", "Petty Cash"}),
            "bank": total_by({"Bank", "Bank Account", "Savings Bank Account"}),
            "sales": sales,
            "purchases": purchases,
            "profit": total_income - total_expenses,
            "pending_vouchers": await db.vouchers.count_documents({"status": "Pending"}),
        },
        "recent_journals": serialize_many(journals),
        "monthly": [{"key": key, **values, "profit": values["revenue"] - values["expenses"]} for key, values in sorted(monthly.items())],
        "expense_breakdown": [
            {"name": name, "value": value}
            for name, value in sorted(expense_breakdown.items(), key=lambda item: item[1], reverse=True)[:6]
        ],
    }


@router.get("/trial-balance")
async def trial_balance(_: dict = Depends(get_current_user)):
    rows = []
    for account in await accounts_with_balances(get_database()):
        balance = account.get("balance", 0)
        debit_nature = account.get("type") in {"Asset", "Expense"}
        debit = abs(balance) if (debit_nature and balance >= 0) or (not debit_nature and balance < 0) else 0
        credit = abs(balance) if (not debit_nature and balance >= 0) or (debit_nature and balance < 0) else 0
        rows.append({
            "id": str(account["_id"]),
            "code": account["code"],
            "name": account["name"],
            "type": account["type"],
            "group": account["group"],
            "debit": debit,
            "credit": credit,
        })
    return {
        "rows": rows,
        "total_debit": sum(row["debit"] for row in rows),
        "total_credit": sum(row["credit"] for row in rows),
    }


@router.get("/ledger-accounts")
async def ledger_accounts(_: dict = Depends(get_current_user)):
    names = await get_database().journal_entries.distinct(
        "entries.account", {"status": "Posted"}
    )
    return {"accounts": sorted(name for name in names if name)}


@router.get("/ledger/{account_name}")
async def ledger(account_name: str, _: dict = Depends(get_current_user)):
    db = get_database()
    account = await db.accounts.find_one({"name": account_name})
    journal_docs = await db.journal_entries.find({"status": "Posted", "entries.account": account_name}).sort("date", 1).to_list(length=None)
    balance = account.get("opening_balance", 0) if account else 0
    debit_nature = not account or account.get("type") in {"Asset", "Expense"}
    rows = []
    for doc in journal_docs:
        for line in doc["entries"]:
            if line["account"] != account_name:
                continue
            movement = line.get("debit", 0) - line.get("credit", 0)
            balance += movement if debit_nature else -movement
            rows.append({
                "date": doc["date"],
                "particulars": doc["narration"],
                "voucher_no": doc["voucher_no"],
                "type": "Receipt" if line.get("debit", 0) else "Payment",
                "debit": line.get("debit", 0),
                "credit": line.get("credit", 0),
                "balance": balance,
            })
    return rows


@router.get("/ledger/{account_name}/page")
async def ledger_page(account_name: str, params: PageParams = Depends(), _: dict = Depends(get_current_user)):
    db = get_database()
    account = await db.accounts.find_one({"name": account_name})
    balance = float(account.get("opening_balance", 0) if account else 0)
    debit_nature = not account or account.get("type") in {"Asset", "Expense"}
    prior_pipeline = [{"$match": {"_id": {"$exists": False}}}]
    if params.skip:
        prior_pipeline = [
            {"$limit": params.skip},
            {"$group": {"_id": None, "debit": {"$sum": "$entries.debit"}, "credit": {"$sum": "$entries.credit"}}},
        ]
    pipeline = [
        {"$match": {"status": "Posted", "entries.account": account_name}},
        {"$unwind": "$entries"},
        {"$match": {"entries.account": account_name}},
        {"$sort": {"date": 1, "_id": 1}},
        {"$facet": {
            "metadata": [{"$count": "total"}],
            "prior": prior_pipeline,
            "items": [{"$skip": params.skip}, {"$limit": params.page_size}],
        }},
    ]
    result = (await db.journal_entries.aggregate(pipeline).to_list(1))[0]
    total = result["metadata"][0]["total"] if result["metadata"] else 0
    if result["prior"]:
        movement = float(result["prior"][0].get("debit", 0)) - float(result["prior"][0].get("credit", 0))
        balance += movement if debit_nature else -movement
    rows = []
    for doc in result["items"]:
        line = doc["entries"]
        debit, credit = float(line.get("debit", 0)), float(line.get("credit", 0))
        movement = debit - credit
        balance += movement if debit_nature else -movement
        rows.append({"date": doc["date"], "particulars": doc["narration"], "voucher_no": doc["voucher_no"], "type": "Receipt" if debit else "Payment", "debit": debit, "credit": credit, "balance": balance})
    return {**page_response([], params, total), "items": rows}
