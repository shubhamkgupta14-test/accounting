from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.database import get_database
from app.dependencies import require_roles

router = APIRouter(prefix="/admin", tags=["admin"])

DEFAULT_SELECTED_COLLECTIONS = {
    "inventory_movements", "journal_entries", "partners", "transactions", "vouchers",
}
ALL_CLEANABLE_COLLECTIONS = [
    "accounts",
    "app_settings",
    "partners",
    "auth_rate_limits",
    "companies",
    "inventory_movements",
    "journal_entries",
    "notification_reads",
    "notifications",
    "page_content",
    "password_reset_otps",
    "transactions",
    "users",
    "vouchers",
]


async def _partner_cleanup_details(db):
    saved = await db.app_settings.find_one({"_id": "global"}, {"partners": 1}) or {}
    partners = saved.get("partners", [])
    account_names = {
        name
        for partner in partners
        for name in (
            str(partner.get("account_name", "")).strip(),
            f"{str(partner.get('partner_name', '')).strip()} Loan",
            f"{str(partner.get('partner_name', '')).strip()} Drawings",
        )
        if name and name not in {"Loan", "Drawings"}
    }
    account_query = {"$or": [
        {"partner_capital": True},
        {"partner_loan": True},
        {"partner_drawings": True},
        *([{"name": {"$in": sorted(account_names)}}] if account_names else []),
    ]}
    return partners, account_query


class CleanRequest(BaseModel):
    collections: list[str]


@router.get("/collections")
async def list_collections(_: dict = Depends(require_roles("superadmin"))):
    db = get_database()
    rows = []
    for name in ALL_CLEANABLE_COLLECTIONS:
        if name == "partners":
            partners, account_query = await _partner_cleanup_details(db)
            document_count = len(partners) + await db.accounts.count_documents(account_query)
        else:
            document_count = await db[name].count_documents({})
        rows.append({
            "name": name,
            "default_selected": name in DEFAULT_SELECTED_COLLECTIONS,
            "protected_default": name not in DEFAULT_SELECTED_COLLECTIONS,
            "document_count": document_count,
        })
    return rows


@router.post("/clean")
async def clean_collections(payload: CleanRequest, _: dict = Depends(require_roles("superadmin"))):
    db = get_database()
    deleted: dict[str, int] = {}
    allowed = set(ALL_CLEANABLE_COLLECTIONS)
    invalid = sorted(set(payload.collections) - allowed)
    if invalid:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="One or more collections are not allowed")
    selected = set(payload.collections)
    if "partners" in selected:
        partners, account_query = await _partner_cleanup_details(db)
        accounts_result = await db.accounts.delete_many(account_query)
        await db.app_settings.update_one(
            {"_id": "global"},
            {"$set": {"partners": []}},
        )
        deleted["partners"] = len(partners) + accounts_result.deleted_count
    for name in selected - {"partners"}:
        result = await db[name].delete_many({})
        deleted[name] = result.deleted_count
    return {"deleted": deleted}
