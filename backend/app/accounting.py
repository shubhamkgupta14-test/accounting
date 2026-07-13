DEBIT_TYPES = {"Asset", "Expense"}


def natural_balance(account: dict, totals: dict[str, dict[str, float]]) -> float:
    opening = float(account.get("opening_balance", 0) or 0)
    account_totals = totals.get(account.get("name"), {"debit": 0, "credit": 0})
    debit = float(account_totals.get("debit", 0) or 0)
    credit = float(account_totals.get("credit", 0) or 0)
    if account.get("type") in DEBIT_TYPES:
        return opening + debit - credit
    return opening + credit - debit


async def journal_totals_by_account(db) -> dict[str, dict[str, float]]:
    rows = await db.journal_entries.aggregate([
        {"$match": {"status": "Posted"}},
        {"$unwind": "$entries"},
        {"$group": {"_id": "$entries.account", "debit": {"$sum": "$entries.debit"}, "credit": {"$sum": "$entries.credit"}}},
    ]).to_list(length=None)
    return {row["_id"]: {"debit": float(row.get("debit", 0)), "credit": float(row.get("credit", 0))} for row in rows if row.get("_id")}


async def accounts_with_balances(db) -> list[dict]:
    accounts = await db.accounts.find({}).sort("code", 1).to_list(500)
    totals = await journal_totals_by_account(db)
    for account in accounts:
        account["balance"] = natural_balance(account, totals)
    return accounts
