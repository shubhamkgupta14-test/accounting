from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.database import get_database
from app.dependencies import require_roles

router = APIRouter(prefix="/admin", tags=["admin"])

DEFAULT_SELECTED_COLLECTIONS = {
    "inventory_movements", "journal_entries", "transactions", "vouchers",
}
ALL_CLEANABLE_COLLECTIONS = [
    "accounts",
    "app_settings",
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


class CleanRequest(BaseModel):
    collections: list[str]


@router.get("/collections")
async def list_collections(_: dict = Depends(require_roles("superadmin"))):
    return [
        {
            "name": name,
            "default_selected": name in DEFAULT_SELECTED_COLLECTIONS,
            "protected_default": name not in DEFAULT_SELECTED_COLLECTIONS,
        }
        for name in ALL_CLEANABLE_COLLECTIONS
    ]


@router.post("/clean")
async def clean_collections(payload: CleanRequest, _: dict = Depends(require_roles("superadmin"))):
    db = get_database()
    deleted: dict[str, int] = {}
    allowed = set(ALL_CLEANABLE_COLLECTIONS)
    invalid = sorted(set(payload.collections) - allowed)
    if invalid:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="One or more collections are not allowed")
    for name in set(payload.collections):
        result = await db[name].delete_many({})
        deleted[name] = result.deleted_count
    return {"deleted": deleted}
