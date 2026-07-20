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
    "Cash": "CH",
    "Bank": "BK",
    "Current Assets": "CA",
    "Fixed Assets": "FA",
    "Non-current Assets": "NCA",
    "Current Liabilities": "CL",
    "Tax Liabilities": "TL",
    "Long-term Liabilities": "LL",
    "Capital": "CP",
    "Direct Income": "DI",
    "Indirect Income": "II",
    "Direct Expenses": "DE",
    "Indirect Expenses": "IE",
}


ALLOWED_GROUPS = {
    "Asset": {"Cash", "Bank", "Current Assets", "Fixed Assets", "Non-current Assets"},
    "Liability": {"Current Liabilities", "Tax Liabilities", "Long-term Liabilities"},
    "Equity": {"Capital"},
    "Income": {"Direct Income", "Indirect Income"},
    "Expense": {"Direct Expenses", "Indirect Expenses"},
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
    {"code": "CA001", "name": "Cash", "type": "Asset", "group": "Cash"},
    {"code": "CA002", "name": "Petty Cash", "type": "Asset", "group": "Cash"},
    {"code": "BA001", "name": "Bank Account", "type": "Asset", "group": "Bank"},
    {"code": "BA002", "name": "Savings Bank Account",
        "type": "Asset", "group": "Bank"},
    {"code": "AR001", "name": "Accounts Receivable",
        "type": "Asset", "group": "Current Assets"},
    {"code": "AR002", "name": "Sundry Debtors",
        "type": "Asset", "group": "Current Assets"},
    {"code": "IN001", "name": "Inventory / Stock",
        "type": "Asset", "group": "Current Assets"},
    {"code": "AD001", "name": "Advance to Suppliers",
        "type": "Asset", "group": "Current Assets"},
    {"code": "PA001", "name": "Prepaid Expenses",
        "type": "Asset", "group": "Current Assets"},
    {"code": "CA003", "name": "Stock-in-Hand",
        "type": "Asset", "group": "Current Assets"},
    {"code": "FA001", "name": "Furniture & Fixtures",
        "type": "Asset", "group": "Fixed Assets"},
    {"code": "FA002", "name": "Computer Equipment",
        "type": "Asset", "group": "Fixed Assets"},
    {"code": "FA003", "name": "Office Equipment",
        "type": "Asset", "group": "Fixed Assets"},
    {"code": "FA004", "name": "Plant & Machinery",
        "type": "Asset", "group": "Fixed Assets"},
    {"code": "FA005", "name": "Vehicles", "type": "Asset", "group": "Fixed Assets"},
    {"code": "FA006", "name": "Building", "type": "Asset", "group": "Fixed Assets"},
    {"code": "AP001", "name": "Accounts Payable",
        "type": "Liability", "group": "Current Liabilities"},
    {"code": "AP002", "name": "Sundry Creditors",
        "type": "Liability", "group": "Current Liabilities"},
    {"code": "CL001", "name": "Outstanding Expenses",
        "type": "Liability", "group": "Current Liabilities"},
    {"code": "CL002", "name": "Salary Payable",
        "type": "Liability", "group": "Current Liabilities"},
    {"code": "TX001", "name": "GST Payable",
        "type": "Liability", "group": "Tax Liabilities"},
    {"code": "TX002", "name": "TDS Payable",
        "type": "Liability", "group": "Tax Liabilities"},
    {"code": "LN001", "name": "Bank Loan",
        "type": "Liability", "group": "Long-term Liabilities"},
    {"code": "LN002", "name": "Vehicle Loan",
        "type": "Liability", "group": "Long-term Liabilities"},
    {"code": "EQ001", "name": "Capital", "type": "Equity", "group": "Capital", "opening_balance": 800_000},
    {"code": "EQ002", "name": "Drawings", "type": "Equity", "group": "Capital"},
    {"code": "EQ003", "name": "Retained Earnings",
        "type": "Equity", "group": "Capital"},
    {"code": "INCM001", "name": "Sales", "type": "Income", "group": "Direct Income"},
    {"code": "INCM002", "name": "Service Income",
        "type": "Income", "group": "Direct Income"},
    {"code": "INCM003", "name": "Sales Returns",
        "type": "Expense", "group": "Direct Expenses"},
    {"code": "INCM004", "name": "Commission Income",
        "type": "Income", "group": "Indirect Income"},
    {"code": "INCM005", "name": "Discount Received",
        "type": "Income", "group": "Indirect Income"},
    {"code": "INCM006", "name": "Interest Income",
        "type": "Income", "group": "Indirect Income"},
    {"code": "EX001", "name": "Purchases",
        "type": "Expense", "group": "Direct Expenses"},
    {"code": "EX002", "name": "Purchase Returns",
        "type": "Income", "group": "Direct Income"},
    {"code": "EX004", "name": "Freight / Carriage Inwards",
        "type": "Expense", "group": "Direct Expenses"},
    {"code": "EX017", "name": "Wages", "type": "Expense", "group": "Direct Expenses"},
    {"code": "EX005", "name": "Salary Expense",
        "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX006", "name": "Rent Expense",
        "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX007", "name": "Electricity Expense",
        "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX008", "name": "Internet & Telephone",
        "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX009", "name": "Office Supplies",
        "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX010", "name": "Printing & Stationery",
        "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX011", "name": "Repairs & Maintenance",
        "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX012", "name": "Travelling Expense",
        "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX013", "name": "Marketing & Advertising",
        "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX014", "name": "Bank Charges",
        "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX015", "name": "Depreciation",
        "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX016", "name": "Insurance Expense",
        "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX018", "name": "Discount Allowed",
        "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX019", "name": "Freight / Carriage Outwards",
        "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX020", "name": "Miscellaneous Expense",
        "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX020", "name": "Advertisement Expense",
        "type": "Expense", "group": "Indirect Expenses"},
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
