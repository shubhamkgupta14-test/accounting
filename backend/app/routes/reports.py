from collections import defaultdict

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.database import get_database
from app.core.config import settings
from app.dependencies import get_current_user
from app.accounting import accounts_with_balances
from app.utils import serialize_many
from app.pagination import PageParams, page_response
from app.financial_reports import Period, build_comparative_reports, build_financial_report, evaluate_stock_value, get_financial_year, is_inventory_account

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/financial-years")
async def available_financial_years(_: dict = Depends(get_current_user)):
    """Indian FY periods derived from dates that actually exist in journals."""
    dates = await get_database().journal_entries.distinct("date")
    periods = set()
    for value in dates:
        try:
            parsed = value if isinstance(value, date) else date.fromisoformat(str(value)[:10])
        except (TypeError, ValueError):
            continue
        periods.add(get_financial_year(parsed))
    return {
        "periods": [
            {"start_date": period.start_date, "end_date": period.end_date}
            for period in sorted(periods, key=lambda item: item.start_date, reverse=True)
        ]
    }


@router.get("/financial-statements")
async def financial_statements(start_date: date, end_date: date, business_start_date: date | None = None, _: dict = Depends(get_current_user)):
    try:
        return await build_financial_report(get_database(), Period(start_date, end_date), business_start_date)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/comparative-financial-statements")
async def comparative_financial_statements(
    as_of: list[date] = Query(
        ...,
        min_length=1,
        max_length=settings.max_comparative_periods,
        description="One date in each Indian FY to compare",
    ),
    business_start_date: date | None = None,
    _: dict = Depends(get_current_user),
):
    periods = list(dict.fromkeys(get_financial_year(value) for value in as_of))
    return {"columns": await build_comparative_reports(get_database(), periods, business_start_date)}


@router.get("/stock-value")
async def stock_value(as_of_date: date, method: str = "FIFO", _: dict = Depends(get_current_user)):
    try:
        value = await evaluate_stock_value(get_database(), as_of_date, method)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"as_of_date": as_of_date, "method": method, "value": value}


@router.get("/journal-data")
async def financial_report_journal_data(_: dict = Depends(get_current_user)):
    """Complete journal feed used to build financial statements."""
    db = get_database()
    total = await db.journal_entries.count_documents({
        "system_entry_type": {"$ne": "FY_CLOSE"}
    }, limit=settings.max_report_rows + 1)
    if total > settings.max_report_rows:
        raise HTTPException(
            status_code=413,
            detail="Journal report is too large; use a filtered or paginated report",
        )
    docs = await db.journal_entries.find(
        {"system_entry_type": {"$ne": "FY_CLOSE"}},
        {"date": 1, "voucher_no": 1, "narration": 1, "entries": 1, "status": 1},
    ).sort("date", 1).to_list(length=None)
    return serialize_many(docs)


@router.get("/dashboard")
async def dashboard(graph_start_date: date | None = None, graph_end_date: date | None = None, _: dict = Depends(get_current_user)):
    if graph_start_date and graph_end_date and graph_end_date < graph_start_date:
        raise HTTPException(status_code=422, detail="graph_end_date must be on or after graph_start_date")
    db = get_database()
    accounts = await accounts_with_balances(db)
    journals = await db.journal_entries.find({}).sort("date", -1).limit(5).to_list(5)
    posted = await db.journal_entries.find(
        {"status": "Posted", "system_entry_type": {"$ne": "FY_CLOSE"}},
        {"date": 1, "entries": 1},
    ).sort("date", 1).to_list(length=None)
    # Dashboard "All" must use the same period-aware P&L engine as reports.
    # Expand it to the full FY boundaries represented by the ledger data.
    if graph_start_date is None and graph_end_date is None and posted:
        journal_dates = []
        for journal in posted:
            try:
                journal_dates.append(date.fromisoformat(str(journal.get("date", ""))[:10]))
            except ValueError:
                continue
        if journal_dates:
            graph_start_date = get_financial_year(min(journal_dates)).start_date
            graph_end_date = get_financial_year(max(journal_dates)).end_date
    account_types = {account["name"]: account.get("type") for account in accounts}
    account_groups = {account["name"]: account.get("group") for account in accounts}
    stock_names = {
        account["name"] for account in accounts
        if is_inventory_account(account)
    }
    cash_bank_names = {
        account["name"] for account in accounts
        if "cash" in account["name"].lower() or account.get("group", "").lower() == "bank"
    }
    monthly = defaultdict(lambda: {"revenue": 0.0, "expenses": 0.0, "inflow": 0.0, "outflow": 0.0})
    expense_breakdown = defaultdict(float)
    as_of_totals = defaultdict(lambda: {"debit": 0.0, "credit": 0.0})
    sales = 0.0
    purchases = 0.0
    for journal in posted:
        key = str(journal.get("date", ""))[:7]
        if not key:
            continue
        journal_date = str(journal.get("date", ""))[:10]
        in_graph_period = (
            (graph_start_date is None or journal_date >= graph_start_date.isoformat())
            and (graph_end_date is None or journal_date <= graph_end_date.isoformat())
        )
        journal_lines = journal.get("entries", [])
        has_stock_line = any(line.get("account") in stock_names for line in journal_lines)
        def is_trading_counterpart(account_name: str) -> bool:
            normalized = account_name.strip().lower()
            return (
                normalized in {"purchase", "purchases", "sale", "sales"}
                or account_groups.get(account_name) in {"Direct Expenses", "Direct Income"}
            )
        has_direct_counterpart = any(
            line.get("account") not in stock_names
            and is_trading_counterpart(line.get("account", ""))
            for line in journal_lines
        )
        is_stock_adjustment = has_stock_line and has_direct_counterpart
        for line in journal.get("entries", []):
            name = line.get("account", "")
            debit = float(line.get("debit", 0) or 0)
            credit = float(line.get("credit", 0) or 0)
            is_stock_counterpart = is_stock_adjustment and name not in stock_names and is_trading_counterpart(name)
            if graph_end_date is None or journal_date <= graph_end_date.isoformat():
                as_of_totals[name]["debit"] += debit
                as_of_totals[name]["credit"] += credit
            if in_graph_period and name == "Sales" and not is_stock_counterpart:
                sales += credit - debit
            if in_graph_period and name == "Purchases" and not is_stock_counterpart:
                purchases += debit - credit
            if in_graph_period and account_types.get(name) == "Income" and not is_stock_counterpart:
                monthly[key]["revenue"] += credit - debit
            if in_graph_period and account_types.get(name) == "Expense" and not is_stock_counterpart:
                monthly[key]["expenses"] += debit - credit
                expense_breakdown[name] += debit - credit
            if in_graph_period and name in cash_bank_names:
                monthly[key]["inflow"] += debit
                monthly[key]["outflow"] += credit
    manual_transactions = await db.transactions.find({}, {"date": 1, "debit": 1, "credit": 1}).to_list(length=None)
    for transaction in manual_transactions:
        key = str(transaction.get("date", ""))[:7]
        transaction_date = str(transaction.get("date", ""))[:10]
        in_graph_period = (
            (graph_start_date is None or transaction_date >= graph_start_date.isoformat())
            and (graph_end_date is None or transaction_date <= graph_end_date.isoformat())
        )
        if key and in_graph_period:
            monthly[key]["inflow"] += float(transaction.get("debit", 0) or 0)
            monthly[key]["outflow"] += float(transaction.get("credit", 0) or 0)

    def account_balance(account: dict) -> float:
        if graph_end_date is None:
            return float(account.get("balance", 0) or 0)
        totals = as_of_totals[account["name"]]
        opening = float(account.get("opening_balance", 0) or 0)
        return opening + totals["debit"] - totals["credit"] if account.get("type") in {"Asset", "Expense"} else opening + totals["credit"] - totals["debit"]

    def total_by(names: set[str]) -> float:
        return sum(account_balance(a) for a in accounts if a.get("name") in names or a.get("group") in names)

    total_income = sum(values["revenue"] for values in monthly.values())
    total_expenses = sum(values["expenses"] for values in monthly.values())
    dashboard_profit = total_income - total_expenses
    if graph_start_date and graph_end_date:
        statement = await build_financial_report(db, Period(graph_start_date, graph_end_date))
        pnl = statement["profit_and_loss"]
        dashboard_profit = float(pnl["net_profit"])
        purchases = sum(
            float(row["amount"])
            for row in pnl["direct_expenses"]
            if row["name"].strip().lower() in {"purchase", "purchases"}
        )
        sales = sum(
            float(row["amount"])
            for row in pnl["direct_income"]
            if row["name"].strip().lower() in {"sale", "sales"}
        )
    pending_query: dict = {"status": "Pending"}
    if graph_start_date or graph_end_date:
        pending_query["date"] = {
            **({"$gte": graph_start_date.isoformat()} if graph_start_date else {}),
            **({"$lte": graph_end_date.isoformat()} if graph_end_date else {}),
        }
    return {
        "stats": {
            "cash": total_by({"Cash", "Petty Cash"}),
            "bank": total_by({"Bank", "Bank Account", "Savings Bank Account"}),
            "sales": sales,
            "purchases": purchases,
            "profit": dashboard_profit,
            "pending_vouchers": await db.vouchers.count_documents(pending_query),
        },
        "recent_journals": serialize_many(journals),
        "monthly": [{"key": key, **values, "profit": values["revenue"] - values["expenses"]} for key, values in sorted(monthly.items())],
        "expense_breakdown": [
            {"name": name, "value": value}
            for name, value in sorted(expense_breakdown.items(), key=lambda item: item[1], reverse=True)[:6]
            if value > 0.005
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
    db = get_database()
    names = await db.journal_entries.distinct("entries.account", {
        "status": "Posted", "system_entry_type": {"$ne": "FY_CLOSE"}
    })
    return {"accounts": sorted(name for name in names if name)}


@router.get("/ledger/{account_name}")
async def ledger(account_name: str, _: dict = Depends(get_current_user)):
    db = get_database()
    account = await db.accounts.find_one({"name": account_name})
    query = {
        "entries.account": account_name,
        "status": "Posted",
        "system_entry_type": {"$ne": "FY_CLOSE"},
    }
    total = await db.journal_entries.count_documents(
        query, limit=settings.max_report_rows + 1)
    if total > settings.max_report_rows:
        raise HTTPException(
            status_code=413,
            detail="Ledger is too large; use the paginated ledger endpoint",
        )
    journal_docs = await db.journal_entries.find(query).sort("date", 1).to_list(length=None)
    balance = account.get("opening_balance", 0) if account else 0
    debit_nature = not account or account.get("type") in {"Asset", "Expense"}
    rows = []
    for doc in journal_docs:
        counterparts = [
            str(entry.get("account", "")).strip()
            for entry in doc.get("entries", [])
            if entry.get("account") != account_name and str(entry.get("account", "")).strip()
        ]
        particulars = " / ".join(dict.fromkeys(counterparts)) or doc["narration"]
        for line in doc["entries"]:
            if line["account"] != account_name:
                continue
            movement = line.get("debit", 0) - line.get("credit", 0)
            balance += movement if debit_nature else -movement
            rows.append({
                "date": doc["date"],
                "particulars": particulars,
                "voucher_no": doc["voucher_no"],
                "type": "Receipt" if line.get("debit", 0) else "Payment",
                "debit": line.get("debit", 0),
                "credit": line.get("credit", 0),
                "balance": balance,
            })
    return rows


@router.get("/ledger/{account_name}/page")
@router.get("/ledger-page")
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
        {"$match": {
            "entries.account": account_name,
            "status": "Posted",
            "system_entry_type": {"$ne": "FY_CLOSE"},
        }},
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
