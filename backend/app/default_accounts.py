"""Small, seed-aligned chart of accounts for a clean database."""

ESSENTIAL_DEFAULT_ACCOUNTS = (
    {"code": "A-CH-001", "name": "Cash", "type": "Asset", "group": "Cash"},
    {"code": "A-BK-001", "name": "Bank Account", "type": "Asset", "group": "Bank"},
    {"code": "A-CA-002", "name": "Sundry Debtors", "type": "Asset", "group": "Current Assets"},
    {"code": "A-DTA-001", "name": "Input IGST", "type": "Asset", "group": "Deffered Tax Assets"},
    {"code": "A-DTA-002", "name": "Input CGST", "type": "Asset", "group": "Deffered Tax Assets"},
    {"code": "A-DTA-003", "name": "Input SGST", "type": "Asset", "group": "Deffered Tax Assets"},
    {"code": "L-CL-002", "name": "Sundry Creditors", "type": "Liability", "group": "Current Liabilities"},
    {"code": "L-DTL-001", "name": "Output IGST", "type": "Liability", "group": "Deffered Tax Liabilities"},
    {"code": "L-DTL-002", "name": "Output CGST", "type": "Liability", "group": "Deffered Tax Liabilities"},
    {"code": "L-DTL-003", "name": "Output SGST", "type": "Liability", "group": "Deffered Tax Liabilities"},
    {"code": "E-CP-001", "name": "Capital", "type": "Equity", "group": "Capital"},
    {"code": "I-DI-001", "name": "Sales", "type": "Income", "group": "Direct Income"},
    {"code": "X-DE-001", "name": "Sales Returns", "type": "Expense", "group": "Direct Expenses"},
    {"code": "X-DE-002", "name": "Purchases", "type": "Expense", "group": "Direct Expenses"},
    {"code": "I-DI-003", "name": "Purchase Returns", "type": "Income", "group": "Direct Income"},
    {"code": "X-IE-002", "name": "Rent Expense", "type": "Expense", "group": "Indirect Expenses"},
)
