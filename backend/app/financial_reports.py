"""Period-aware financial statements and perpetual FIFO stock valuation.

MongoDB collections used by this module:

accounts: {name, code, type, group, opening_balance}
journal_entries: {date: "YYYY-MM-DD", entries: [{account, debit, credit}]}
inventory_movements: {date: "YYYY-MM-DD", item_id, quantity, rate, transaction_type}

Quantities are positive. ``rate`` is the unit cost and is required for INWARD
movements; an OUTWARD movement consumes the oldest available layers.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal


BALANCE_SHEET_TYPES = {"Asset", "Liability", "Equity"}
DEBIT_TYPES = {"Asset", "Expense"}
INVENTORY_TERMS = (
    "stock", "inventory", "inventories", "raw material", "raw-material", "finished goods",
    "work in progress", "work-in-progress", "wip", "goods in transit",
    "stores and spares", "stores & spares",
)
DIRECT_INCOME_GROUPS = {"Direct Income", "Revenue from Operations"}
INDIRECT_INCOME_GROUPS = {"Indirect Income", "Other Income"}
DIRECT_EXPENSE_GROUPS = {
    "Direct Expenses", "Cost of Goods Sold", "Cost of Materials Consumed",
    "Purchases of Stock-in-Trade", "Changes in Inventories",
}
INDIRECT_EXPENSE_GROUPS = {
    "Indirect Expenses", "Employee Benefits Expense", "Finance Costs",
    "Depreciation and Amortisation Expense", "Other Expenses",
    "Current Tax Expense", "Deferred Tax Expense",
}


def is_inventory_account(account: dict) -> bool:
    """Recognize inventory assets by either their ledger name or group."""
    if account.get("type") != "Asset":
        return False
    text = f"{account.get('name', '')} {account.get('group', '')}".strip().lower()
    return any(term in text for term in INVENTORY_TERMS)


@dataclass(frozen=True)
class Period:
    start_date: date
    end_date: date

    def __post_init__(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")

    @property
    def opening_as_of(self) -> date:
        return self.start_date - timedelta(days=1)


def get_financial_year(value: date) -> Period:
    """Return the Indian FY (1 April to 31 March) containing ``value``."""
    start_year = value.year if value.month >= 4 else value.year - 1
    return Period(date(start_year, 4, 1), date(start_year + 1, 3, 31))


def _iso(value: date) -> str:
    return value.isoformat()


def _movement(account: dict, debit: float, credit: float) -> float:
    return debit - credit if account.get("type") in DEBIT_TYPES else credit - debit


async def _journal_movements(db, period: Period):
    """Return (prior, period) natural-balance movements keyed by account name."""
    accounts = await db.accounts.find({}).sort("code", 1).to_list(length=None)
    account_map = {row["name"]: row for row in accounts}
    rows = await db.journal_entries.aggregate([
        {"$match": {
            "date": {"$lte": _iso(period.end_date)},
            "status": "Posted",
            "system_entry_type": {"$ne": "FY_CLOSE"},
        }},
        {"$unwind": "$entries"},
        {"$group": {
            "_id": {"account": "$entries.account", "prior": {"$lt": ["$date", _iso(period.start_date)]}},
            "debit": {"$sum": "$entries.debit"},
            "credit": {"$sum": "$entries.credit"},
        }},
    ]).to_list(length=None)
    prior, current = {}, {}
    prior_active, current_active = set(), set()
    for row in rows:
        account = account_map.get(row["_id"]["account"])
        if not account:
            continue
        target = prior if row["_id"]["prior"] else current
        (prior_active if row["_id"]["prior"] else current_active).add(account["name"])
        target[account["name"]] = _movement(
            account, float(row.get("debit", 0) or 0), float(row.get("credit", 0) or 0)
        )
    return accounts, prior, current, prior_active, current_active


async def _profit_transfer_movements(db, period: Period, account_map: dict[str, dict]):
    """Natural-balance movements used only to omit auto transfers from the TB."""
    rows = await db.journal_entries.aggregate([
        {"$match": {
            "date": {"$lte": _iso(period.end_date)},
            "status": "Posted",
            "system_entry_type": "PROFIT_TRANSFER",
        }},
        {"$unwind": "$entries"},
        {"$group": {
            "_id": {"account": "$entries.account", "prior": {"$lt": ["$date", _iso(period.start_date)]}},
            "debit": {"$sum": "$entries.debit"},
            "credit": {"$sum": "$entries.credit"},
        }},
    ]).to_list(length=None)
    prior, current = {}, {}
    for row in rows:
        account = account_map.get(row["_id"]["account"])
        if not account:
            continue
        target = prior if row["_id"]["prior"] else current
        target[account["name"]] = _movement(
            account, float(row.get("debit", 0) or 0), float(row.get("credit", 0) or 0)
        )
    return prior, current


async def evaluate_stock_value(db, as_of_date: date, method: Literal["FIFO"] = "FIFO") -> float:
    """Value remaining inventory at ``as_of_date`` using historical FIFO layers."""
    if method != "FIFO":
        raise ValueError("Only FIFO valuation is currently supported")
    movements = await db.inventory_movements.find(
        {"date": {"$lte": _iso(as_of_date)}}
    ).sort([("date", 1), ("_id", 1)]).to_list(length=None)
    layers: dict[str, list[list[float]]] = {}
    for row in movements:
        item_id = str(row["item_id"])
        quantity = float(row["quantity"])
        item_layers = layers.setdefault(item_id, [])
        if row["transaction_type"] == "INWARD":
            item_layers.append([quantity, float(row["rate"])])
            continue
        remaining = quantity
        while remaining > 1e-9 and item_layers:
            used = min(remaining, item_layers[0][0])
            item_layers[0][0] -= used
            remaining -= used
            if item_layers[0][0] <= 1e-9:
                item_layers.pop(0)
        if remaining > 1e-9:
            raise ValueError(f"Negative stock for item {item_id} on {row['date']}")
    return round(sum(qty * rate for item in layers.values() for qty, rate in item), 2)


async def build_financial_report(db, period: Period, business_start_date: date | None = None) -> dict:
    """Build Trial Balance, P&L and Balance Sheet for one arbitrary period."""
    accounts, prior, current, prior_active, current_active = await _journal_movements(db, period)
    transfer_prior, transfer_current = await _profit_transfer_movements(
        db, period, {account["name"]: account for account in accounts}
    )
    book_prior, book_current = dict(prior), dict(current)
    opening, closing = {}, {}
    for account in accounts:
        name = account["name"]
        base = float(account.get("opening_balance", 0) or 0)
        if account.get("type") in BALANCE_SHEET_TYPES:
            opening[name] = base + book_prior.get(name, 0)
            closing[name] = opening[name] + book_current.get(name, 0)
        else:
            opening[name] = 0.0
            closing[name] = book_current.get(name, 0)

    starts_in_period = business_start_date is not None and period.start_date <= business_start_date <= period.end_date
    stock_accounts = [account for account in accounts if is_inventory_account(account)]
    stock_ledger_names = {account["name"].strip().lower() for account in stock_accounts}
    has_inventory = await db.inventory_movements.count_documents(
        {"date": {"$lte": _iso(period.end_date)}}, limit=1
    ) > 0
    if has_inventory:
        opening_stock = 0.0 if starts_in_period else await evaluate_stock_value(db, period.opening_as_of)
        closing_stock = await evaluate_stock_value(db, period.end_date)
        stock_source = "FIFO"
    else:
        opening_stock = 0.0 if starts_in_period else sum(opening[account["name"]] for account in stock_accounts)
        closing_stock = sum(closing[account["name"]] for account in stock_accounts)
        stock_source = "Stock-in-Hand ledger"

    def rows(types: set[str], groups: set[str] | None = None, balances=closing):
        result = []
        for account in accounts:
            if account.get("type") not in types or (groups and account.get("group") not in groups):
                continue
            amount = float(balances.get(account["name"], 0))
            has_ledger_data = account["name"] in current_active
            has_opening = abs(float(account.get("opening_balance", 0) or 0)) >= .005
            if abs(amount) >= .005 or has_ledger_data or has_opening:
                result.append({"code": account.get("code"), "name": account["name"], "type": account.get("type"), "group": account.get("group"), "amount": amount})
        return result

    # Periodic-stock journals are presentation entries. Their Purchases/direct
    # counterpart is removed because stock is shown separately in Trading A/c.
    normalized_current = dict(current)
    presentation_adjustments: dict[str, float] = {}
    if not has_inventory and stock_accounts:
        stock_names = {account["name"] for account in stock_accounts}
        stock_journals = await db.journal_entries.find({
            "date": {"$gte": _iso(period.start_date), "$lte": _iso(period.end_date)},
            "entries.account": {"$in": list(stock_names)},
        }).to_list(length=None)
        for journal in stock_journals:
            for line in journal.get("entries", []):
                account = next((item for item in accounts if item["name"] == line.get("account")), None)
                normalized_name = str(line.get("account", "")).strip().lower()
                if not account or (
                    account.get("group") not in DIRECT_EXPENSE_GROUPS | DIRECT_INCOME_GROUPS
                    and normalized_name not in {"purchase", "purchases", "sale", "sales"}
                ):
                    continue
                adjustment = _movement(account, float(line.get("debit", 0) or 0), float(line.get("credit", 0) or 0))
                normalized_current[account["name"]] = normalized_current.get(account["name"], 0) - adjustment
                presentation_adjustments[account["name"]] = presentation_adjustments.get(account["name"], 0) - adjustment

    direct_expenses = rows({"Expense"}, DIRECT_EXPENSE_GROUPS, normalized_current)
    direct_income = rows({"Income"}, DIRECT_INCOME_GROUPS, normalized_current)
    indirect_expenses = rows({"Expense"}, INDIRECT_EXPENSE_GROUPS, current)
    indirect_income = rows({"Income"}, INDIRECT_INCOME_GROUPS, current)
    purchases_and_direct = sum(row["amount"] for row in direct_expenses)
    sales_and_direct = sum(row["amount"] for row in direct_income)
    gross_profit = sales_and_direct + closing_stock - opening_stock - purchases_and_direct
    net_profit = gross_profit + sum(r["amount"] for r in indirect_income) - sum(r["amount"] for r in indirect_expenses)

    # Inventory is computed, so exclude any ledger-based stock account to avoid double counting.
    assets = [r for r in rows({"Asset"}) if r["name"].strip().lower() not in stock_ledger_names]
    if abs(closing_stock) >= .005 or has_inventory or any(account["name"] in current_active for account in stock_accounts):
        assets.append({"code": "STOCK-IN-HAND", "name": "Stock-in-Hand", "type": "Asset", "group": "Inventories", "amount": closing_stock, "calculated": True, "source": stock_source})
    # Profit/loss is transferred to Capital by a posted closing journal.  The
    # transfer account is a journal clearing account, not a Balance Sheet item.
    claims = [
        row for row in rows({"Liability", "Equity"})
        if row["name"] != "Profit & Loss Account"
    ]
    opening_asset_value = sum(
        amount for account_name, amount in opening.items()
        if next((a for a in accounts if a["name"] == account_name), {}).get("type") == "Asset"
        and account_name.strip().lower() not in stock_ledger_names
    ) + opening_stock
    opening_claim_value = sum(
        opening[account["name"]] for account in accounts
        if account.get("type") in {"Liability", "Equity"}
    )
    opening_retained_earnings = opening_asset_value - opening_claim_value
    trial = []
    for account in accounts:
        name = account["name"]
        # The automatic transfer is posted to the ledgers and Balance Sheet,
        # but is intentionally omitted from the Trial Balance presentation.
        # Prior-year transfers are part of next year's opening Capital.  The
        # P&L clearing side is never carried into the Trial Balance.
        opening_amount = opening[name]
        if name == "Profit & Loss Account":
            opening_amount -= transfer_prior.get(name, 0)
        period_amount = book_current.get(name, 0) - transfer_current.get(name, 0)
        balance = opening_amount + period_amount
        if all(abs(amount) < .005 for amount in (opening_amount, period_amount, balance)):
            continue
        debit_nature = account.get("type") in DEBIT_TYPES
        trial.append({
            "code": account.get("code"), "name": name, "type": account.get("type"),
            "group": account.get("group"), "opening_balance": opening_amount,
            "period_movement": period_amount, "closing_balance": balance,
            "debit": abs(balance) if (debit_nature and balance >= 0) or (not debit_nature and balance < 0) else 0,
            "credit": abs(balance) if (not debit_nature and balance >= 0) or (debit_nature and balance < 0) else 0,
        })

    return {
        "period": {"start_date": _iso(period.start_date), "end_date": _iso(period.end_date)},
        "trial_balance": {"rows": trial, "total_debit": sum(r["debit"] for r in trial), "total_credit": sum(r["credit"] for r in trial)},
        "profit_and_loss": {"opening_stock": opening_stock, "closing_stock": closing_stock, "direct_expenses": direct_expenses, "direct_income": direct_income, "indirect_expenses": indirect_expenses, "indirect_income": indirect_income, "gross_profit": gross_profit, "net_profit": net_profit},
        "balance_sheet": {"assets": assets, "liabilities_and_capital": claims, "closing_stock": closing_stock, "opening_retained_earnings": opening_retained_earnings},
    }


async def build_comparative_reports(db, periods: list[Period], business_start_date: date | None = None) -> list[dict]:
    """Generate independent side-by-side columns from the same ledger data."""
    return [await build_financial_report(db, period, business_start_date) for period in periods]
