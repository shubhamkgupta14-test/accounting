import argparse
import asyncio
from collections import defaultdict
from datetime import datetime, timezone
import os
from pathlib import Path
import sys
from urllib.parse import urlparse

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT))

TYPE_CODE_PREFIX = {
    "Asset": "A",
    "Liability": "L",
    "Equity": "E",
    "Income": "I",
    "Expense": "X",
}

GROUP_CODE_PREFIX = {
    "Land and Building": "LB", "Plant and Machinery": "PM", "Furniture and Fixtures": "FF",
    "Vehicles": "VEH", "Computers and Office Equipment": "COE", "Other Fixed Assets": "OFA",
    "Intangible Assets": "IA", "Capital Work-in-Progress": "CWIP",
    "Long-term Loans and Advances": "LTLA", "Security Deposits": "SD", "Deferred Tax Assets": "DTA",
    "Inventories": "INV", "Trade Receivables": "TR", "Cash-in-Hand": "CIH",
    "Bank Accounts": "BANK", "Short-term Loans and Advances": "STLA", "Prepaid Expenses": "PE",
    "Other Current Assets": "OCA", "Secured Loans": "SL", "Unsecured Loans": "UL",
    "Partner Loans": "PL", "Bank Overdraft and Cash Credit": "BOCC",
    "Deferred Tax Liabilities": "DTL", "Long-term Provisions": "LTP", "Trade Payables": "TP",
    "Duties and Taxes": "DT", "Output GST": "OGST", "TDS Payable": "TDS",
    "Outstanding Expenses": "OE", "Salary and Wages Payable": "SWP",
    "Short-term Provisions": "STP", "Other Current Liabilities": "OCL",
    "Proprietor's Capital": "PC", "Partner Capital": "PAC", "Partner Current Accounts": "PCA",
    "Drawings": "DRW", "General Reserve": "GR", "Retained Earnings": "RE",
    "Current Year Profit and Loss": "CYPL", "Direct Income": "DI", "Indirect Income": "II",
    "Other Income": "OI", "Direct Expenses": "DE", "Indirect Expenses": "IE", "Other Expenses": "OX",
}


ALLOWED_GROUPS = {
    "Asset": {"Land and Building", "Plant and Machinery", "Furniture and Fixtures", "Vehicles", "Computers and Office Equipment", "Other Fixed Assets", "Intangible Assets", "Capital Work-in-Progress", "Long-term Loans and Advances", "Security Deposits", "Deferred Tax Assets", "Inventories", "Trade Receivables", "Cash-in-Hand", "Bank Accounts", "Short-term Loans and Advances", "Prepaid Expenses", "Other Current Assets"},
    "Liability": {"Secured Loans", "Unsecured Loans", "Partner Loans", "Bank Overdraft and Cash Credit", "Deferred Tax Liabilities", "Long-term Provisions", "Trade Payables", "Duties and Taxes", "Output GST", "TDS Payable", "Outstanding Expenses", "Salary and Wages Payable", "Short-term Provisions", "Other Current Liabilities"},
    "Equity": {"Proprietor's Capital", "Partner Capital", "Partner Current Accounts", "Drawings", "General Reserve", "Retained Earnings", "Current Year Profit and Loss"},
    "Income": {"Direct Income", "Indirect Income", "Other Income"},
    "Expense": {"Direct Expenses", "Indirect Expenses", "Other Expenses"},
}

USERS = [
    {
        "first_name": "Super",
        "last_name": "Admin",
        "email": "superadmin@accountingapp.com",
        "role": "superadmin",
        "password": "password123",
    },
    {
        "first_name": "First",
        "last_name": "Last",
        "email": "admin@accountingapp.com",
        "role": "admin",
        "password": "password123",
    },
    {
        "first_name": "Student",
        "last_name": "Viewer",
        "email": "user@accountingapp.com",
        "role": "user",
        "password": "password123",
    },
]

DEFAULT_ACCOUNTS = [
    {"code": "CA001", "name": "Cash", "type": "Asset", "group": "Cash-in-Hand"},
    {"code": "CA002", "name": "Petty Cash", "type": "Asset", "group": "Cash-in-Hand"},
    {"code": "BA001", "name": "Bank Account", "type": "Asset", "group": "Bank Accounts"},
    {"code": "BA002", "name": "Savings Bank Account", "type": "Asset", "group": "Bank Accounts"},
    {"code": "AR001", "name": "Accounts Receivable", "type": "Asset", "group": "Trade Receivables"},
    {"code": "AR002", "name": "Sundry Debtors", "type": "Asset", "group": "Trade Receivables"},
    {"code": "IN001", "name": "Inventory / Stock", "type": "Asset", "group": "Inventories"},
    {"code": "AD001", "name": "Advance to Suppliers", "type": "Asset", "group": "Short-term Loans and Advances"},
    {"code": "PA001", "name": "Prepaid Expenses", "type": "Asset", "group": "Prepaid Expenses"},
    {"code": "CA003", "name": "Stock-in-Hand", "type": "Asset", "group": "Inventories"},
    {"code": "GSTIN001", "name": "Input IGST", "type": "Asset", "group": "Deferred Tax Assets"},
    {"code": "GSTIN002", "name": "Input CGST", "type": "Asset", "group": "Deferred Tax Assets"},
    {"code": "GSTIN003", "name": "Input SGST", "type": "Asset", "group": "Deferred Tax Assets"},
    {"code": "FA001", "name": "Furniture & Fixtures", "type": "Asset", "group": "Furniture and Fixtures"},
    {"code": "FA002", "name": "Computer Equipment", "type": "Asset", "group": "Computers and Office Equipment"},
    {"code": "FA003", "name": "Office Equipment", "type": "Asset", "group": "Computers and Office Equipment"},
    {"code": "FA004", "name": "Plant & Machinery", "type": "Asset", "group": "Plant and Machinery"},
    {"code": "FA005", "name": "Vehicles", "type": "Asset", "group": "Vehicles"},
    {"code": "FA006", "name": "Building", "type": "Asset", "group": "Land and Building"},
    {"code": "AP001", "name": "Accounts Payable", "type": "Liability", "group": "Trade Payables"},
    {"code": "AP002", "name": "Sundry Creditors", "type": "Liability", "group": "Trade Payables"},
    {"code": "CL001", "name": "Outstanding Expenses", "type": "Liability", "group": "Outstanding Expenses"},
    {"code": "CL002", "name": "Salary Payable", "type": "Liability", "group": "Salary and Wages Payable"},
    {"code": "TX001", "name": "GST Payable", "type": "Liability", "group": "Duties and Taxes"},
    {"code": "TX002", "name": "TDS Payable", "type": "Liability", "group": "TDS Payable"},
    {"code": "GSTOUT001", "name": "Output IGST", "type": "Liability", "group": "Deferred Tax Liabilities"},
    {"code": "GSTOUT002", "name": "Output CGST", "type": "Liability", "group": "Deferred Tax Liabilities"},
    {"code": "GSTOUT003", "name": "Output SGST", "type": "Liability", "group": "Deferred Tax Liabilities"},
    {"code": "LN001", "name": "Bank Loan", "type": "Liability", "group": "Secured Loans"},
    {"code": "LN002", "name": "Vehicle Loan", "type": "Liability", "group": "Secured Loans"},
    {"code": "EQ001", "name": "Capital", "type": "Equity", "group": "Proprietor's Capital", "opening_balance": 800_000},
    {"code": "EQ002", "name": "Drawings", "type": "Equity", "group": "Drawings"},
    {"code": "EQ003", "name": "Retained Earnings", "type": "Equity", "group": "Retained Earnings"},
    {"code": "INCM001", "name": "Sales", "type": "Income", "group": "Direct Income"},
    {"code": "INCM002", "name": "Service Income", "type": "Income", "group": "Direct Income"},
    {"code": "INCM003", "name": "Sales Returns", "type": "Income", "group": "Direct Income"},
    {"code": "INCM004", "name": "Commission Income", "type": "Income", "group": "Indirect Income"},
    {"code": "INCM005", "name": "Discount Received", "type": "Income", "group": "Other Income"},
    {"code": "INCM006", "name": "Interest Income", "type": "Income", "group": "Other Income"},
    {"code": "EX001", "name": "Purchases", "type": "Expense", "group": "Direct Expenses"},
    {"code": "EX002", "name": "Purchase Returns", "type": "Expense", "group": "Direct Expenses"},
    {"code": "EX004", "name": "Freight / Carriage Inwards", "type": "Expense", "group": "Direct Expenses"},
    {"code": "EX017", "name": "Wages", "type": "Expense", "group": "Direct Expenses"},
    {"code": "EX005", "name": "Salary Expense", "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX006", "name": "Rent Expense", "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX007", "name": "Electricity Expense", "type": "Expense", "group": "Other Expenses"},
    {"code": "EX008", "name": "Internet & Telephone", "type": "Expense", "group": "Other Expenses"},
    {"code": "EX009", "name": "Office Supplies", "type": "Expense", "group": "Other Expenses"},
    {"code": "EX010", "name": "Printing & Stationery", "type": "Expense", "group": "Other Expenses"},
    {"code": "EX011", "name": "Repairs & Maintenance", "type": "Expense", "group": "Other Expenses"},
    {"code": "EX012", "name": "Travelling Expense", "type": "Expense", "group": "Other Expenses"},
    {"code": "EX013", "name": "Marketing & Advertising", "type": "Expense", "group": "Other Expenses"},
    {"code": "EX014", "name": "Bank Charges", "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX015", "name": "Depreciation", "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX016", "name": "Insurance Expense", "type": "Expense", "group": "Other Expenses"},
    {"code": "EX018", "name": "Discount Allowed", "type": "Expense", "group": "Other Expenses"},
    {"code": "EX019", "name": "Freight / Carriage Outwards", "type": "Expense", "group": "Other Expenses"},
    {"code": "EX020", "name": "Miscellaneous Expense", "type": "Expense", "group": "Other Expenses"},
    {"code": "EX021", "name": "Advertisement Expense", "type": "Expense", "group": "Other Expenses"},
]


def assign_account_codes(accounts: list[dict]) -> list[dict]:
    counters: dict[tuple[str, str], int] = defaultdict(int)
    coded_accounts = []
    for account in accounts:
        key = (account["type"], account["group"])
        counters[key] += 1
        code = (
            f"{TYPE_CODE_PREFIX[account['type']]}-"
            f"{GROUP_CODE_PREFIX[account['group']]}-{counters[key]:03d}"
        )
        coded_accounts.append({**account, "code": code})
    return coded_accounts


DEFAULT_ACCOUNTS = assign_account_codes(DEFAULT_ACCOUNTS)


def validate_unique(items: list[dict], field: str, label: str) -> None:
    values = [str(item[field]).strip() for item in items]
    duplicates = sorted({value for value in values if values.count(value) > 1})
    if duplicates:
        raise ValueError(
            f"Duplicate {label} {field}(s): {', '.join(duplicates)}")


def validate_account_groups(accounts: list[dict]) -> None:
    invalid = [
        f'{account["name"]}: {account["type"]} / {account["group"]}'
        for account in accounts
        if account["group"] not in ALLOWED_GROUPS.get(account["type"], set())
    ]
    if invalid:
        raise ValueError(
            f"Invalid account type/group combinations: {'; '.join(invalid)}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Reset and seed the selected backend environment.")
    parser.add_argument(
        "--env", choices=("dev", "stage"), default="dev",
        help="Backend environment to seed (default: dev)",
    )
    parser.add_argument(
        "--confirm-stage-reset", action="store_true",
        help="Required for stage because all existing accounting data is deleted",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Show and validate the selected target without changing data",
    )
    args = parser.parse_args()
    if args.env == "stage" and not args.dry_run and not args.confirm_stage_reset:
        parser.error("stage reset requires --confirm-stage-reset")
    return args


async def main(args: argparse.Namespace):
    env_file = ROOT / (".env.stage" if args.env == "stage" else ".env")
    if not env_file.is_file():
        raise FileNotFoundError(f"Environment file not found: {env_file}")

    # Settings are created during app imports, so load the selected file first.
    load_dotenv(env_file, override=True)
    from app.core.config import settings
    from app.core.database import close_mongo_connection, connect_to_mongo, get_database
    from app.core.security import hash_password

    users = USERS
    if args.env == "stage":
        bootstrap_email = os.getenv("ACCOUNTING_BOOTSTRAP_EMAIL", "").strip()
        bootstrap_password = os.getenv("ACCOUNTING_BOOTSTRAP_PASSWORD", "")
        if not bootstrap_email or len(bootstrap_password) < 12:
            raise RuntimeError(
                "Stage seeding requires ACCOUNTING_BOOTSTRAP_EMAIL and "
                "ACCOUNTING_BOOTSTRAP_PASSWORD (minimum 12 characters)"
            )
        users = [{
            "first_name": os.getenv("ACCOUNTING_BOOTSTRAP_FIRST_NAME", "Stage").strip() or "Stage",
            "last_name": os.getenv("ACCOUNTING_BOOTSTRAP_LAST_NAME", "Administrator").strip() or "Administrator",
            "email": bootstrap_email,
            "role": "superadmin",
            "password": bootstrap_password,
        }]

    # Validate static seed data before performing the destructive cleanup.
    validate_unique(users, "email", "user")
    validate_unique(DEFAULT_ACCOUNTS, "code", "account")
    validate_unique(DEFAULT_ACCOUNTS, "name", "account")
    validate_account_groups(DEFAULT_ACCOUNTS)

    database_host = urlparse(settings.mongodb_uri).hostname or "unknown"
    print(
        f"Seeding environment={args.env}, host={database_host}, "
        f"database={settings.mongodb_db}"
    )
    if args.dry_run:
        print("Dry run complete. No database changes were made.")
        return

    await connect_to_mongo()
    db = get_database()

    await db.users.delete_many({})
    await db.companies.delete_many({})
    await db.accounts.delete_many({})
    await db.journal_entries.delete_many({})
    await db.vouchers.delete_many({})
    await db.transactions.delete_many({})

    now = datetime.now(timezone.utc)
    await db.users.insert_many([
        {
            "first_name": user["first_name"],
            "last_name": user["last_name"],
            "email": user["email"],
            "role": user["role"],
            "password_hash": hash_password(user["password"]),
            "is_active": True,
            "token_version": 0,
            "created_at": now,
        }
        for user in users
    ])
    await db.accounts.insert_many([
        {
            **account,
            "opening_balance": account.get("opening_balance", 0),
            "is_active": True,
            "created_at": now,
        }
        for account in DEFAULT_ACCOUNTS
    ])

    await db.accounts.create_index("code", unique=True)
    await db.accounts.create_index("name", unique=True)
    await db.users.create_index("email", unique=True)
    await db.journal_entries.create_index("voucher_no", unique=True)
    await db.vouchers.create_index("voucher_no", unique=True)
    await close_mongo_connection()

    print(
        f"Cleaned Accounting data and created users plus {len(DEFAULT_ACCOUNTS)} default accounts.")
    if args.env == "dev":
        print("Development demo users created. Credentials are defined only in the development seed.")
    else:
        print("Stage bootstrap user created from environment configuration.")


if __name__ == "__main__":
    asyncio.run(main(parse_args()))
