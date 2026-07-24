"""Small, seed-aligned chart of accounts for a clean database."""

ESSENTIAL_DEFAULT_ACCOUNTS = (
    {"code": "A-CIH-001", "name": "Cash", "type": "Asset", "group": "Cash-in-Hand"},
    {"code": "A-BANK-001", "name": "Bank Account", "type": "Asset", "group": "Bank Accounts"},
    {"code": "A-TR-002", "name": "Sundry Debtors", "type": "Asset", "group": "Trade Receivables"},
    {"code": "A-DTA-001", "name": "Input IGST", "type": "Asset", "group": "Deferred Tax Assets"},
    {"code": "A-DTA-002", "name": "Input CGST", "type": "Asset", "group": "Deferred Tax Assets"},
    {"code": "A-DTA-003", "name": "Input SGST", "type": "Asset", "group": "Deferred Tax Assets"},
    {"code": "L-TP-002", "name": "Sundry Creditors", "type": "Liability", "group": "Trade Payables"},
    {"code": "L-DTL-001", "name": "Output IGST", "type": "Liability", "group": "Deferred Tax Liabilities"},
    {"code": "L-DTL-002", "name": "Output CGST", "type": "Liability", "group": "Deferred Tax Liabilities"},
    {"code": "L-DTL-003", "name": "Output SGST", "type": "Liability", "group": "Deferred Tax Liabilities"},
    {"code": "E-PC-001", "name": "Capital", "type": "Equity", "group": "Proprietor's Capital"},
    {"code": "I-DI-001", "name": "Sales", "type": "Income", "group": "Direct Income"},
    {"code": "I-DI-003", "name": "Sales Returns", "type": "Income", "group": "Direct Income"},
    {"code": "X-DE-001", "name": "Purchases", "type": "Expense", "group": "Direct Expenses"},
    {"code": "X-DE-002", "name": "Purchase Returns", "type": "Expense", "group": "Direct Expenses"},
    {"code": "X-IE-002", "name": "Rent Expense", "type": "Expense", "group": "Indirect Expenses"},
)
