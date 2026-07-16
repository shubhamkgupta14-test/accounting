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
        {"$match": {"status": "Posted", "system_entry_type": {"$ne": "FY_CLOSE"}}},
        {"$unwind": "$entries"},
        {"$group": {"_id": "$entries.account", "debit": {"$sum": "$entries.debit"}, "credit": {"$sum": "$entries.credit"}}},
    ]).to_list(length=None)
    return {row["_id"]: {"debit": float(row.get("debit", 0)), "credit": float(row.get("credit", 0))} for row in rows if row.get("_id")}


async def accounts_with_balances(db) -> list[dict]:
    accounts = await db.accounts.find({}).sort("code", 1).to_list(length=None)
    totals = await journal_totals_by_account(db)
    for account in accounts:
        account["balance"] = natural_balance(account, totals)
    return accounts


async def add_balances_to_accounts(db, accounts: list[dict]) -> list[dict]:
    names = [account["name"] for account in accounts]
    if not names:
        return accounts
    rows = await db.journal_entries.aggregate([
        {"$match": {
            "entries.account": {"$in": names},
            "status": "Posted",
            "system_entry_type": {"$ne": "FY_CLOSE"},
        }},
        {"$unwind": "$entries"},
        {"$match": {"entries.account": {"$in": names}}},
        {"$group": {"_id": "$entries.account", "debit": {"$sum": "$entries.debit"}, "credit": {"$sum": "$entries.credit"}}},
    ]).to_list(length=None)
    totals = {row["_id"]: row for row in rows}
    for account in accounts:
        account["balance"] = natural_balance(account, totals)
    return accounts
