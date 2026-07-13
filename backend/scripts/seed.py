import asyncio
from datetime import datetime, timezone
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT))

from app.core.database import close_mongo_connection, connect_to_mongo, get_database
from app.core.security import hash_password


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
    {"code": "CA001", "name": "Cash", "type": "Asset", "group": "Cash & Cash Equivalent"},
    {"code": "CA002", "name": "Petty Cash", "type": "Asset", "group": "Cash & Cash Equivalent"},
    {"code": "BA001", "name": "Bank Account", "type": "Asset", "group": "Bank"},
    {"code": "BA002", "name": "Savings Bank Account", "type": "Asset", "group": "Bank"},
    {"code": "AR001", "name": "Accounts Receivable", "type": "Asset", "group": "Current Assets"},
    {"code": "AR002", "name": "Sundry Debtors", "type": "Asset", "group": "Current Assets"},
    {"code": "IN001", "name": "Inventory / Stock", "type": "Asset", "group": "Current Assets"},
    {"code": "AD001", "name": "Advance to Suppliers", "type": "Asset", "group": "Current Assets"},
    {"code": "PA001", "name": "Prepaid Expenses", "type": "Asset", "group": "Current Assets"},
    {"code": "CL001", "name": "Closing Stock", "type": "Asset", "group": "Current Assets"},
    {"code": "FA001", "name": "Furniture & Fixtures", "type": "Asset", "group": "Fixed Assets"},
    {"code": "FA002", "name": "Computer Equipment", "type": "Asset", "group": "Fixed Assets"},
    {"code": "FA003", "name": "Office Equipment", "type": "Asset", "group": "Fixed Assets"},
    {"code": "FA004", "name": "Plant & Machinery", "type": "Asset", "group": "Fixed Assets"},
    {"code": "FA005", "name": "Vehicles", "type": "Asset", "group": "Fixed Assets"},
    {"code": "FA006", "name": "Building", "type": "Asset", "group": "Fixed Assets"},
    {"code": "AP001", "name": "Accounts Payable", "type": "Liability", "group": "Current Liabilities"},
    {"code": "AP002", "name": "Sundry Creditors", "type": "Liability", "group": "Current Liabilities"},
    {"code": "CL001", "name": "Outstanding Expenses", "type": "Liability", "group": "Current Liabilities"},
    {"code": "CL002", "name": "Salary Payable", "type": "Liability", "group": "Current Liabilities"},
    {"code": "TX001", "name": "GST Payable", "type": "Liability", "group": "Tax Liabilities"},
    {"code": "TX002", "name": "TDS Payable", "type": "Liability", "group": "Tax Liabilities"},
    {"code": "LN001", "name": "Bank Loan", "type": "Liability", "group": "Long-term Liabilities"},
    {"code": "LN002", "name": "Vehicle Loan", "type": "Liability", "group": "Long-term Liabilities"},
    {"code": "EQ001", "name": "Capital", "type": "Equity", "group": "Capital"},
    {"code": "EQ002", "name": "Drawings", "type": "Equity", "group": "Capital"},
    {"code": "EQ003", "name": "Retained Earnings", "type": "Equity", "group": "Capital"},
    {"code": "INCM001", "name": "Sales", "type": "Income", "group": "Direct Income"},
    {"code": "INCM002", "name": "Service Income", "type": "Income", "group": "Direct Income"},
    {"code": "INCM003", "name": "Sales Returns", "type": "Expense", "group": "Direct Expense"},
    {"code": "INCM004", "name": "Commission Income", "type": "Income", "group": "Indirect Income"},
    {"code": "INCM005", "name": "Discount Received", "type": "Income", "group": "Indirect Income"},
    {"code": "INCM006", "name": "Interest Income", "type": "Income", "group": "Indirect Income"},
    {"code": "EX001", "name": "Purchases", "type": "Expense", "group": "Direct Expenses"},
    {"code": "EX002", "name": "Purchase Returns", "type": "Income", "group": "Direct Income"},
    {"code": "EX004", "name": "Freight / Carriage Inwards", "type": "Expense", "group": "Direct Expenses"},
    {"code": "EX017", "name": "Wages", "type": "Expense", "group": "Direct Expenses"},
    {"code": "EX005", "name": "Salary Expense", "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX006", "name": "Rent Expense", "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX007", "name": "Electricity Expense", "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX008", "name": "Internet & Telephone", "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX009", "name": "Office Supplies", "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX010", "name": "Printing & Stationery", "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX011", "name": "Repairs & Maintenance", "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX012", "name": "Travelling Expense", "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX013", "name": "Marketing & Advertising", "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX014", "name": "Bank Charges", "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX015", "name": "Depreciation", "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX016", "name": "Insurance Expense", "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX018", "name": "Discount Allowed", "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX019", "name": "Freight / Carriage Outwards", "type": "Expense", "group": "Indirect Expenses"},
    {"code": "EX020", "name": "Miscellaneous Expense", "type": "Expense", "group": "Indirect Expenses"},
]


async def main():
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
        for user in USERS
    ])
    await db.accounts.insert_many([
        {
            **account,
            "opening_balance": 0,
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

    print(f"Cleaned Accounting data and created users plus {len(DEFAULT_ACCOUNTS)} default accounts.")
    print("Logins: superadmin@accountingapp.com / admin@accountingapp.com / user@accountingapp.com")
    print("Password for all demo users: password123")


if __name__ == "__main__":
    asyncio.run(main())
