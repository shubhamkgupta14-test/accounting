from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.database import get_database
from app.dependencies import require_roles

router = APIRouter(prefix="/admin", tags=["admin"])

DEFAULT_PROTECTED_COLLECTIONS = {"users", "accounts"}
ALL_CLEANABLE_COLLECTIONS = [
    "companies",
    "journal_entries",
    "vouchers",
    "transactions",
    "notifications",
    "notification_reads",
    "password_reset_otps",
    "auth_rate_limits",
    "app_settings",
]


class CleanRequest(BaseModel):
    collections: list[str]


@router.get("/collections")
async def list_collections(_: dict = Depends(require_roles("superadmin"))):
    existing = set(await get_database().list_collection_names())
    return [
        {"name": name, "default_selected": name not in DEFAULT_PROTECTED_COLLECTIONS, "protected_default": name in DEFAULT_PROTECTED_COLLECTIONS}
        for name in sorted(existing | set(ALL_CLEANABLE_COLLECTIONS) | DEFAULT_PROTECTED_COLLECTIONS)
    ]


@router.post("/clean")
async def clean_collections(payload: CleanRequest, _: dict = Depends(require_roles("superadmin"))):
    db = get_database()
    deleted: dict[str, int] = {}
    allowed = set(ALL_CLEANABLE_COLLECTIONS) | DEFAULT_PROTECTED_COLLECTIONS
    invalid = sorted(set(payload.collections) - allowed)
    if invalid:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="One or more collections are not allowed")
    for name in set(payload.collections):
        result = await db[name].delete_many({})
        deleted[name] = result.deleted_count
    return {"deleted": deleted}
