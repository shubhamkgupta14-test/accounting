"""Seed the 2026 50-voucher accounting scenario through the HTTP API only.

The script creates or skips JV-001 through JV-050 and is safe to run
repeatedly. Existing vouchers, including JV-001, are never recreated.

Set ACCOUNTING_API_EMAIL and ACCOUNTING_API_PASSWORD, then run:
npm run seed:vouchers -- --base-url http://127.0.0.1:8000
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from http.cookiejar import CookieJar
from urllib.error import HTTPError, URLError
from urllib.request import HTTPCookieProcessor, Request, build_opener


EXPECTED = {
    "cash": 354_000,
    "bank": 203_500,
    "gross_sales": 430_000,
    "sales_returns": 10_000,
    "net_sales": 420_000,
    "gross_purchases": 315_000,
    "purchase_returns": 18_000,
    "goods_withdrawn": 4_000,
    "net_purchases": 293_000,
    "gross_profit": 199_000,
    "net_profit": 176_500,
    "closing_stock": 90_000,
    "drawings": 29_000,
    "closing_capital": 647_500,
    "balance_sheet": 647_500,
}

TYPE_CODE_PREFIX = {"Asset": "A", "Liability": "L",
                    "Equity": "E", "Income": "I", "Expense": "X"}

GROUP_CODE_PREFIX = {
    "Cash-in-Hand": "CIH",
    "Bank Accounts": "BANK",
    "Inventories": "INV",
    "Trade Receivables": "TR",
    "Trade Payables": "TP",
    "Proprietor's Capital": "PC",
    "Drawings": "DRW",
    "Direct Income": "DI",
    "Indirect Income": "II",
    "Other Income": "OI",
    "Direct Expenses": "DE",
    "Indirect Expenses": "IE",
    "Other Expenses": "OE",
}


def next_account_code(account_type: str, group: str, used_codes: set[str]) -> str:
    prefix = f"{TYPE_CODE_PREFIX[account_type]}-{GROUP_CODE_PREFIX[group]}-"
    sequence = 1
    while f"{prefix}{sequence:03d}" in used_codes:
        sequence += 1
    return f"{prefix}{sequence:03d}"


ACCOUNTS = [
    ("Cash", "Asset", "Cash-in-Hand"),
    ("Bank Account", "Asset", "Bank Accounts"),
    ("Closing Stock", "Asset", "Inventories"),
    ("Ravi", "Asset", "Trade Receivables"),
    ("Neha", "Asset", "Trade Receivables"),
    ("Amit", "Asset", "Trade Receivables"),
    ("Capital", "Equity", "Proprietor's Capital"),
    ("Aman Traders", "Liability", "Trade Payables"),
    ("Bharat Suppliers", "Liability", "Trade Payables"),
    ("City Wholesalers", "Liability", "Trade Payables"),
    ("Deepak Traders", "Liability", "Trade Payables"),
    ("Sales", "Income", "Direct Income"),
    ("Commission Income", "Income", "Indirect Income"),
    ("Interest Income", "Income", "Other Income"),
    ("Discount Received", "Income", "Other Income"),
    ("Purchases", "Expense", "Direct Expenses"),
    ("Purchase Returns", "Income", "Direct Income"),
    ("Sales Returns", "Income", "Direct Income"),
    ("Wages", "Expense", "Direct Expenses"),
    ("Freight / Carriage Inwards", "Expense", "Direct Expenses"),
    ("Rent Expense", "Expense", "Other Expenses"),
    ("Salary Expense", "Expense", "Indirect Expenses"),
    ("Electricity Expense", "Expense", "Other Expenses"),
    ("Printing & Stationery", "Expense", "Other Expenses"),
    ("Advertisement Expense", "Expense", "Other Expenses"),
    ("Insurance Expense", "Expense", "Other Expenses"),
    ("Discount Allowed", "Expense", "Other Expenses"),
    ("Drawings", "Equity", "Drawings"),
]


def lines(debits: list[tuple[str, float]], credits: list[tuple[str, float]]) -> list[dict]:
    return ([{"account": account, "debit": amount, "credit": 0} for account, amount in debits]
            + [{"account": account, "debit": 0, "credit": amount} for account, amount in credits])


RAW_VOUCHERS = [
    ("2026-04-01", "Being capital introduced in cash.",
     [("Cash", 500_000)], [("Capital", 500_000)]),
    ("2026-04-02", "Being goods purchased for cash.",
     [("Purchases", 50_000)], [("Cash", 50_000)]),
    ("2026-04-04", "Being goods purchased for cash.",
     [("Purchases", 30_000)], [("Cash", 30_000)]),
    ("2026-04-06", "Being goods purchased on credit from Aman Traders.",
     [("Purchases", 40_000)], [("Aman Traders", 40_000)]),
    ("2026-04-08", "Being goods purchased on credit from Aman Traders.",
     [("Purchases", 20_000)], [("Aman Traders", 20_000)]),
    ("2026-04-10", "Being goods purchased on credit from Bharat Suppliers.",
     [("Purchases", 30_000)], [("Bharat Suppliers", 30_000)]),
    ("2026-04-12", "Being goods purchased on credit from Bharat Suppliers.",
     [("Purchases", 25_000)], [("Bharat Suppliers", 25_000)]),
    ("2026-04-14", "Being goods sold for cash.",
     [("Cash", 40_000)], [("Sales", 40_000)]),
    ("2026-04-16", "Being goods sold for cash.",
     [("Cash", 30_000)], [("Sales", 30_000)]),
    ("2026-04-18", "Being goods sold on credit to Ravi.",
     [("Ravi", 50_000)], [("Sales", 50_000)]),
    ("2026-04-20", "Being goods sold on credit to Ravi.",
     [("Ravi", 30_000)], [("Sales", 30_000)]),
    ("2026-04-22", "Being cash deposited into bank.",
     [("Bank Account", 60_000)], [("Cash", 60_000)]),
    ("2026-04-24", "Being cash deposited into bank.",
     [("Bank Account", 40_000)], [("Cash", 40_000)]),
    ("2026-04-26", "Being goods purchased on credit from City Wholesalers.",
     [("Purchases", 50_000)], [("City Wholesalers", 50_000)]),
    ("2026-04-28", "Being goods purchased for cash.",
     [("Purchases", 45_000)], [("Cash", 45_000)]),
    ("2026-04-30", "Being goods sold on credit to Neha.",
     [("Neha", 40_000)], [("Sales", 40_000)]),
    ("2026-05-02", "Being goods sold on credit to Neha.",
     [("Neha", 30_000)], [("Sales", 30_000)]),
    ("2026-05-04", "Being wages paid in cash.",
     [("Wages", 15_000)], [("Cash", 15_000)]),
    ("2026-05-06", "Being carriage inward paid in cash.",
     [("Freight / Carriage Inwards", 3_000)], [("Cash", 3_000)]),
    ("2026-05-08", "Being goods sold for cash.",
     [("Cash", 60_000)], [("Sales", 60_000)]),
    ("2026-05-10", "Being goods sold through bank.",
     [("Bank Account", 50_000)], [("Sales", 50_000)]),
    ("2026-05-12", "Being goods purchased on credit from Deepak Traders.",
     [("Purchases", 25_000)], [("Deepak Traders", 25_000)]),
    ("2026-05-14", "Being goods sold on credit to Amit.",
     [("Amit", 60_000)], [("Sales", 60_000)]),
    ("2026-05-16", "Being goods sold for cash.",
     [("Cash", 40_000)], [("Sales", 40_000)]),
    ("2026-05-18", "Being goods returned by Ravi.",
     [("Sales Returns", 10_000)], [("Ravi", 10_000)]),
    ("2026-05-20", "Being goods returned to Aman Traders.",
     [("Aman Traders", 8_000)], [("Purchase Returns", 8_000)]),
    ("2026-05-22", "Being goods returned to Bharat Suppliers.",
     [("Bharat Suppliers", 10_000)], [("Purchase Returns", 10_000)]),
    ("2026-05-24", "Being amount received from Ravi in full settlement and discount allowed.",
     [("Bank Account", 68_000), ("Discount Allowed", 2_000)], [("Ravi", 70_000)]),
    ("2026-05-28", "Being amount received from Neha by cheque in full settlement.",
     [("Bank Account", 70_000)], [("Neha", 70_000)]),
    ("2026-05-30", "Being cheque received from Amit and deposited into bank.",
     [("Bank Account", 60_000)], [("Amit", 60_000)]),
    ("2026-06-01", "Being Amit's cheque dishonoured by bank.",
     [("Amit", 60_000)], [("Bank Account", 60_000)]),
    ("2026-06-03", "Being cash received from Amit after cheque dishonour.",
     [("Cash", 60_000)], [("Amit", 60_000)]),
    ("2026-06-05", "Being Aman Traders paid by bank in full settlement and discount received.",
     [("Aman Traders", 52_000)], [("Bank Account", 50_000), ("Discount Received", 2_000)]),
    ("2026-06-07", "Being Bharat Suppliers paid by bank in full settlement and discount received.",
     [("Bharat Suppliers", 45_000)], [("Bank Account", 44_500), ("Discount Received", 500)]),
    ("2026-06-09", "Being City Wholesalers paid in cash.",
     [("City Wholesalers", 50_000)], [("Cash", 50_000)]),
    ("2026-06-11", "Being Deepak Traders paid by bank.",
     [("Deepak Traders", 25_000)], [("Bank Account", 25_000)]),
    ("2026-06-13", "Being cash withdrawn for personal use.",
     [("Drawings", 25_000)], [("Cash", 25_000)]),
    ("2026-06-15", "Being goods withdrawn by proprietor for personal use.",
     [("Drawings", 4_000)], [("Purchases", 4_000)]),
    ("2026-06-17", "Being office rent paid in cash.",
     [("Rent Expense", 5_000)], [("Cash", 5_000)]),
    ("2026-06-19", "Being office rent paid in cash.",
     [("Rent Expense", 5_000)], [("Cash", 5_000)]),
    ("2026-06-21", "Being salary paid in cash.",
     [("Salary Expense", 6_000)], [("Cash", 6_000)]),
    ("2026-06-23", "Being salary paid in cash.",
     [("Salary Expense", 6_000)], [("Cash", 6_000)]),
    ("2026-06-25", "Being electricity charges paid in cash.",
     [("Electricity Expense", 4_000)], [("Cash", 4_000)]),
    ("2026-06-27", "Being stationery purchased for cash.",
     [("Printing & Stationery", 2_000)], [("Cash", 2_000)]),
    ("2026-06-29", "Being advertisement expense paid in cash.",
     [("Advertisement Expense", 3_000)], [("Cash", 3_000)]),
    ("2026-07-01", "Being insurance premium paid in cash.",
     [("Insurance Expense", 3_000)], [("Cash", 3_000)]),
    ("2026-07-03", "Being commission received through bank.",
     [("Bank Account", 8_000)], [("Commission Income", 8_000)]),
    ("2026-07-05", "Being interest received through bank.",
     [("Bank Account", 3_000)], [("Interest Income", 3_000)]),
    ("2026-07-08", "Being additional cash deposited into bank.",
     [("Bank Account", 24_000)], [("Cash", 24_000)]),
    ("2026-07-11", "Being closing stock valued and recorded.",
     [("Closing Stock", 90_000)], [("Purchases", 90_000)]),
]

VOUCHERS = [
    {"date": date, "voucher_no": f"JV-{number:03d}", "narration": narration,
     "entries": lines(debits, credits), "status": "Posted"}
    for number, (date, narration, debits, credits) in enumerate(RAW_VOUCHERS, start=1)
]


class ApiClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.opener = build_opener(HTTPCookieProcessor(CookieJar()))

    def request(self, method: str, path: str, payload: dict | None = None):
        data = json.dumps(payload).encode() if payload is not None else None
        request = Request(
            self.base_url + path,
            data=data,
            method=method,
            headers={"Accept": "application/json",
                     "Content-Type": "application/json"},
        )
        try:
            with self.opener.open(request, timeout=10) as response:
                body = response.read()
                return response.status, json.loads(body) if body else None
        except HTTPError as exc:
            body = exc.read().decode(errors="replace")
            try:
                detail = json.loads(body)
            except json.JSONDecodeError:
                detail = body
            raise RuntimeError(
                f"HTTP {exc.code} {method} {path}: {detail}") from exc
        except URLError as exc:
            raise RuntimeError(
                f"Cannot reach {self.base_url}: {exc.reason}") from exc


def validate_plan() -> None:
    if len(VOUCHERS) != 50 or VOUCHERS[0]["voucher_no"] != "JV-001" or VOUCHERS[-1]["voucher_no"] != "JV-050":
        raise ValueError("The plan must contain exactly JV-001 through JV-050")
    for voucher in VOUCHERS:
        debit = round(sum(line["debit"] for line in voucher["entries"]), 2)
        credit = round(sum(line["credit"] for line in voucher["entries"]), 2)
        if debit <= 0 or debit != credit:
            raise ValueError(
                f"Unbalanced {voucher['voucher_no']}: debit={debit}, credit={credit}")


def movement(journals: list[dict], account: str, side: str) -> float:
    return sum(float(line[side]) for journal in journals for line in journal["entries"] if line["account"] == account)


def verify(api: ApiClient) -> bool:
    _, accounts = api.request("GET", "/api/accounts")
    _, journals = api.request("GET", "/api/journal-entries")
    balances = {account["name"]: float(
        account.get("balance", 0)) for account in accounts}

    gross_sales = movement(journals, "Sales", "credit")
    sales_returns = movement(journals, "Sales Returns", "debit")
    gross_purchases = movement(journals, "Purchases", "debit")
    purchase_returns = movement(journals, "Purchase Returns", "credit")
    goods_withdrawn = sum(
        float(line["credit"])
        for journal in journals if "withdrawn" in journal["narration"].lower()
        for line in journal["entries"] if line["account"] == "Purchases"
    )
    net_sales = gross_sales - sales_returns
    net_purchases = gross_purchases - purchase_returns - goods_withdrawn
    direct_expenses = sum(balances.get(name, 0) for name in (
        "Purchases", "Sales Returns", "Wages", "Freight / Carriage Inwards"))
    direct_income = balances.get("Sales", 0) + \
        balances.get("Purchase Returns", 0)
    gross_profit = direct_income - direct_expenses
    income = sum(account.get("balance", 0)
                 for account in accounts if account["type"] == "Income")
    expenses = sum(account.get("balance", 0)
                   for account in accounts if account["type"] == "Expense")
    net_profit = income - expenses
    drawings = movement(journals, "Drawings", "debit")
    closing_capital = balances.get("Capital", 0) + net_profit - drawings
    balance_sheet = sum(account.get("balance", 0)
                        for account in accounts if account["type"] == "Asset")

    actual = {
        "cash": balances.get("Cash", 0), "bank": balances.get("Bank Account", 0),
        "gross_sales": gross_sales, "sales_returns": sales_returns, "net_sales": net_sales,
        "gross_purchases": gross_purchases, "purchase_returns": purchase_returns,
        "goods_withdrawn": goods_withdrawn, "net_purchases": net_purchases,
        "gross_profit": gross_profit, "net_profit": net_profit,
        "closing_stock": balances.get("Closing Stock", 0), "drawings": drawings,
        "closing_capital": closing_capital, "balance_sheet": balance_sheet,
    }
    passed = True
    print("\nVerification")
    for key, expected in EXPECTED.items():
        value = round(float(actual[key]), 2)
        ok = abs(value - expected) < 0.005
        passed &= ok
        print(f"  {'PASS' if ok else 'FAIL'} {key.replace('_', ' ').title()}: {value:,.2f} (expected {expected:,.2f})")
    return passed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base-url", default=os.getenv("ACCOUNTING_API_URL", "http://localhost:8000"))
    parser.add_argument(
        "--email", default=os.getenv("ACCOUNTING_API_EMAIL"))
    parser.add_argument(
        "--password", default=os.getenv("ACCOUNTING_API_PASSWORD"))
    parser.add_argument("--dry-run", action="store_true",
                        help="Validate and inspect without writing")
    args = parser.parse_args()
    if not args.email:
        parser.error("set ACCOUNTING_API_EMAIL or pass --email")
    if not args.password:
        parser.error("set ACCOUNTING_API_PASSWORD or pass --password")

    validate_plan()
    api = ApiClient(args.base_url)
    created = skipped = failed = 0

    try:
        status, health = api.request("GET", "/health")
        if status != 200 or health.get("status") != "ok":
            raise RuntimeError(f"Backend health check failed: {health}")
        print(f"Backend reachable: {args.base_url} ({health['status']})")
        api.request("POST", "/api/auth/login",
                    {"email": args.email, "password": args.password})
        api.request("GET", "/api/auth/me")
        print(f"Authenticated: {args.email}")

        _, current_accounts = api.request("GET", "/api/accounts")
        names = {account["name"] for account in current_accounts}
        used_codes = {account["code"] for account in current_accounts}
        for name, account_type, group in ACCOUNTS:
            if name in names:
                print(f"Ledger {name}: Skipped")
                continue
            code = next_account_code(account_type, group, used_codes)
            if args.dry_run:
                print(f"Ledger {name}: Would create")
            else:
                api.request("POST", "/api/accounts", {
                    "code": code, "name": name, "type": account_type, "group": group,
                    "opening_balance": 0, "is_active": True,
                })
                print(f"Ledger {name}: Created")
            names.add(name)
            used_codes.add(code)

        _, journals = api.request("GET", "/api/journal-entries")
        _, voucher_records = api.request("GET", "/api/vouchers")
        existing_numbers = {row["voucher_no"] for row in journals} | {
            row["voucher_no"] for row in voucher_records}
        for voucher in VOUCHERS:
            number = voucher["voucher_no"]
            if number in existing_numbers:
                skipped += 1
                print(f"{number}: Skipped")
                continue
            if args.dry_run:
                skipped += 1
                print(f"{number}: Skipped (dry run; would create)")
                continue
            try:
                api.request("POST", "/api/journal-entries", voucher)
                created += 1
                print(f"{number}: Created")
            except RuntimeError as exc:
                failed += 1
                print(f"{number}: Failed - {exc}")
                break
    except (RuntimeError, ValueError) as exc:
        failed += 1
        print(f"Failed: {exc}")

    print("\nSummary")
    print(f"  Total planned: {len(VOUCHERS)}")
    print(f"  Created: {created}")
    print(f"  Skipped: {skipped}")
    print(f"  Failed: {failed}")
    if failed or args.dry_run:
        return 1 if failed else 0
    try:
        return 0 if verify(api) else 1
    except RuntimeError as exc:
        print(f"Verification failed: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
