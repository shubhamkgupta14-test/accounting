from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from pymongo import UpdateOne

from app.core.database import get_database
from app.dependencies import require_roles

router = APIRouter(prefix="/content", tags=["content"])

PAGE_CONTENT = {
    "login": {"title": "HappiHome", "description": "Lightweight accounting for small teams and students"},
    "dashboard": {"title": "Dashboard", "description": "Financial overview from current accounts, journals, vouchers, and transactions"},
    "journal": {"title": "Journal Entries", "description": "Create and review double-entry journal records"},
    "vouchers": {"title": "Vouchers", "description": "All transaction vouchers from the database"},
    "ledger": {"title": "Ledger", "description": "Account-wise transaction history from posted journal entries"},
    "cashbook": {"title": "Cash Book", "description": "Cash receipts and payments from transaction records"},
    "bankbook": {"title": "Bank Book", "description": "Bank receipts and payments from transaction records"},
    "trial-balance": {"title": "Trial Balance", "description": "Current balances from the chart of accounts"},
    "trading": {"title": "Trading Account", "description": "Direct income and direct expenses from the chart of accounts"},
    "profit-loss": {"title": "Profit & Loss Account", "description": "Income and expenses from the chart of accounts"},
    "balance-sheet": {"title": "Balance Sheet", "description": "Assets, liabilities, and capital from the chart of accounts"},
    "daybook": {"title": "Day Book", "description": "Chronological log of all journal entries"},
    "chart-of-accounts": {"title": "Ledger Accounts", "description": "Create, classify, and maintain ledger accounts"},
    "reports": {"title": "Reports", "description": "Financial statements, book reports, and management insights"},
    "account-summary": {"title": "Account Summary", "description": "Balances grouped by account classification"},
    "profit-analysis": {"title": "Profit Analysis", "description": "Complete income, expense, and profitability analysis"},
    "cash-flow-report": {"title": "Cash Flow Report", "description": "Combined cash and bank inflows and outflows"},
    "settings": {"title": "Settings", "description": "Manage company, account, and application preferences"},
    "notifications": {"title": "Notification Center", "description": "View system notifications and send announcements"},
    "user-management": {"title": "User Management", "description": "Create, activate, deactivate, delete, and inspect users"},
    "clean-db": {"title": "Clean Database", "description": "Superadmin-only cleanup controls for application data"},
}

DEFAULT_FOOTER = "Accounting data shown from the current company books."


class ContentUpdate(BaseModel):
    page: str = Field(min_length=1, max_length=100, pattern=r"^[a-z0-9-]+$")
    title: str = Field(default="", max_length=200)
    description: str = Field(min_length=1, max_length=1000)


@router.get("")
async def get_content():
    saved = await get_database().page_content.find({}).to_list(length=None)
    pages = {page: dict(values) for page, values in PAGE_CONTENT.items()}
    footer = DEFAULT_FOOTER
    for item in saved:
        page = item["_id"]
        if page == "footer":
            footer = item["description"]
        else:
            pages[page] = {"title": item["title"], "description": item["description"]}
    return {"pages": pages, "footer": footer}


@router.post("")
async def update_content(payload: list[ContentUpdate], _: dict = Depends(require_roles("superadmin"))):
    if not payload:
        raise HTTPException(status_code=400, detail="Provide at least one content item")
    pages = [item.page for item in payload]
    if len(pages) != len(set(pages)):
        raise HTTPException(status_code=400, detail="Each page may appear only once per request")
    unknown = sorted(set(pages) - set(PAGE_CONTENT) - {"footer"})
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown page content keys: {', '.join(unknown)}")
    for item in payload:
        if item.page != "footer" and not item.title.strip():
            raise HTTPException(status_code=400, detail=f"Title is required for page: {item.page}")

    await get_database().page_content.bulk_write([
        UpdateOne(
            {"_id": item.page},
            {"$set": {"title": item.title.strip(), "description": item.description.strip()}},
            upsert=True,
        )
        for item in payload
    ])
    return {"updated": pages, "count": len(payload)}
