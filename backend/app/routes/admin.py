from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import DuplicateKeyError
from pydantic import BaseModel, Field

from app.core.security import verify_password
from app.core.database import get_database
from app.default_accounts import ESSENTIAL_DEFAULT_ACCOUNTS
from app.dependencies import require_roles
from app.utils import object_id

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
    collections: list[str] = Field(min_length=1, max_length=len(ALL_CLEANABLE_COLLECTIONS))
    password: str = Field(min_length=1, max_length=128)


@router.post("/default-accounts", status_code=201)
async def create_default_accounts(_: dict = Depends(require_roles("superadmin"))):
    """Create only the small essential account set used after a database clean."""
    db = get_database()
    names = [account["name"] for account in ESSENTIAL_DEFAULT_ACCOUNTS]
    codes = [account["code"] for account in ESSENTIAL_DEFAULT_ACCOUNTS]
    existing = await db.accounts.find({
        "$or": [
            {"name": {"$in": names}},
            {"code": {"$in": codes}},
        ],
    }).to_list(length=None)

    expected_by_name = {account["name"]: account for account in ESSENTIAL_DEFAULT_ACCOUNTS}
    expected_by_code = {account["code"]: account for account in ESSENTIAL_DEFAULT_ACCOUNTS}
    conflicts = []
    existing_names = set()
    for account in existing:
        expected = expected_by_name.get(account.get("name")) or expected_by_code.get(account.get("code"))
        if not expected or any(account.get(field) != expected[field] for field in ("code", "name", "type", "group")):
            conflicts.append(account.get("name") or account.get("code") or "Unknown account")
        else:
            existing_names.add(account["name"])
    if conflicts:
        raise HTTPException(
            status_code=409,
            detail=f"Default account mapping conflicts with: {', '.join(sorted(conflicts))}",
        )

    now = datetime.now(timezone.utc)
    documents = [
        {**account, "opening_balance": 0, "is_active": True, "created_at": now}
        for account in ESSENTIAL_DEFAULT_ACCOUNTS
        if account["name"] not in existing_names
    ]
    if documents:
        try:
            await db.accounts.insert_many(documents)
        except DuplicateKeyError as exc:
            raise HTTPException(
                status_code=409,
                detail="An account was created concurrently. Please try again.",
            ) from exc
    return {
        "created": len(documents),
        "existing": len(existing_names),
        "total": len(ESSENTIAL_DEFAULT_ACCOUNTS),
    }


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
async def clean_collections(payload: CleanRequest, current_user: dict = Depends(require_roles("superadmin"))):
    db = get_database()
    user = await db.users.find_one({"_id": object_id(current_user["id"], "User")})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(
            status_code=403,
            detail="Password confirmation failed",
        )
    deleted: dict[str, int] = {}
    allowed = set(ALL_CLEANABLE_COLLECTIONS)
    invalid = sorted(set(payload.collections) - allowed)
    if invalid:
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
