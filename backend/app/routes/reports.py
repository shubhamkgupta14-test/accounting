from collections import defaultdict

from fastapi import APIRouter, Depends

from app.core.database import get_database
from app.dependencies import get_current_user
from app.accounting import accounts_with_balances, journal_totals_by_account
from app.utils import serialize_many

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/dashboard")
async def dashboard(_: dict = Depends(get_current_user)):
    db = get_database()
    accounts = await accounts_with_balances(db)
    journal_totals = await journal_totals_by_account(db)
    vouchers = await db.vouchers.find({}).to_list(500)
    journals = await db.journal_entries.find({}).sort("date", -1).limit(5).to_list(5)

    def total_by(names: set[str]) -> float:
        return sum(a.get("balance", 0) for a in accounts if a.get("name") in names or a.get("group") in names)

    sales = journal_totals.get("Sales", {}).get("credit", 0)
    purchases = journal_totals.get("Purchases", {}).get("debit", 0)
    total_income = sum(a.get("balance", 0) for a in accounts if a.get("type") == "Income")
    total_expenses = sum(a.get("balance", 0) for a in accounts if a.get("type") == "Expense")
    return {
        "stats": {
            "cash": total_by({"Cash", "Petty Cash"}),
            "bank": total_by({"Bank", "Bank Account", "Savings Bank Account"}),
            "sales": sales,
            "purchases": purchases,
            "profit": total_income - total_expenses,
            "pending_vouchers": sum(1 for v in vouchers if v.get("status") == "Pending"),
        },
        "recent_journals": serialize_many(journals),
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


@router.get("/ledger/{account_name}")
async def ledger(account_name: str, _: dict = Depends(get_current_user)):
    db = get_database()
    account = await db.accounts.find_one({"name": account_name})
    journal_docs = await db.journal_entries.find({"status": "Posted", "entries.account": account_name}).sort("date", 1).to_list(500)
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
