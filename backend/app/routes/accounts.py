from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Literal
from pymongo import ReturnDocument

from app.core.database import get_database
from app.dependencies import get_current_user, require_roles
from app.schemas import AccountCreate, AccountUpdate
from app.utils import object_id, serialize_doc, serialize_many
from app.accounting import accounts_with_balances, add_balances_to_accounts
from app.pagination import PageParams, SortOrder, page_response, safe_search, sort_direction

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("")
async def list_accounts(_: dict = Depends(get_current_user)):
    db = get_database()
    docs = await accounts_with_balances(db)
    return serialize_many(docs)


@router.get("/page")
async def page_accounts(
    params: PageParams = Depends(),
    search: str | None = Query(default=None, max_length=150),
    account_type: Literal["Asset", "Liability", "Equity", "Income", "Expense"] | None = None,
    group: str | None = Query(default=None, max_length=150),
    sort_by: Literal["code", "name", "type", "group"] = "code",
    sort_order: SortOrder = "asc",
    _: dict = Depends(get_current_user),
):
    db = get_database()
    query: dict = {}
    pattern = safe_search(search)
    if pattern:
        query["$or"] = [{field: {"$regex": pattern, "$options": "i"}} for field in ("code", "name", "group")]
    if account_type:
        query["type"] = account_type
    if group:
        query["group"] = group
    total = await db.accounts.count_documents(query)
    docs = await db.accounts.find(query).sort(sort_by, sort_direction(sort_order)).skip(params.skip).limit(params.page_size).to_list(params.page_size)
    await add_balances_to_accounts(db, docs)
    return page_response(docs, params, total)


@router.get("/stats")
async def account_stats(_: dict = Depends(get_current_user)):
    db = get_database()
    rows = await db.accounts.aggregate([{"$group": {"_id": "$type", "count": {"$sum": 1}}}]).to_list(length=None)
    groups = await db.accounts.distinct("group")
    return {"total": sum(row["count"] for row in rows), "by_type": {row["_id"]: row["count"] for row in rows if row.get("_id")}, "groups": sorted(group for group in groups if group)}


@router.post("", status_code=201)
async def create_account(payload: AccountCreate, _: dict = Depends(require_roles("superadmin", "admin"))):
    db = get_database()
    if await db.accounts.find_one({"$or": [{"code": payload.code}, {"name": payload.name}]}):
        raise HTTPException(status_code=409, detail="Account code or name already exists")
    doc = payload.model_dump()
    doc["created_at"] = datetime.now(timezone.utc)
    result = await db.accounts.insert_one(doc)
    return serialize_doc(await db.accounts.find_one({"_id": result.inserted_id}))


@router.patch("/{account_id}")
async def update_account(account_id: str, payload: AccountUpdate, _: dict = Depends(require_roles("superadmin", "admin"))):
    db = get_database()
    account_oid = object_id(account_id, "Account")
    current = await db.accounts.find_one({"_id": account_oid})
    if not current:
        raise HTTPException(status_code=404, detail="Account not found")
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if data.get("code") and data["code"] != current["code"]:
        if await db.accounts.find_one({"code": data["code"], "_id": {"$ne": account_oid}}):
            raise HTTPException(status_code=409, detail="Account code already exists")
    if data.get("name") and data["name"] != current["name"]:
        if await db.journal_entries.find_one({"entries.account": current["name"]}):
            raise HTTPException(status_code=409, detail="A referenced account cannot be renamed")
        if await db.accounts.find_one({"name": data["name"], "_id": {"$ne": account_oid}}):
            raise HTTPException(status_code=409, detail="Account name already exists")
    data["updated_at"] = datetime.now(timezone.utc)
    result = await db.accounts.find_one_and_update(
        {"_id": account_oid}, {"$set": data}, return_document=ReturnDocument.AFTER
    )
    if not result:
        raise HTTPException(status_code=404, detail="Account not found")
    return serialize_doc(result)


@router.delete("/{account_id}", status_code=204)
async def delete_account(account_id: str, _: dict = Depends(require_roles("superadmin"))):
    db = get_database()
    account = await db.accounts.find_one({"_id": object_id(account_id, "Account")})
    if account and await db.journal_entries.find_one({"entries.account": account["name"]}):
        raise HTTPException(status_code=409, detail="Account is referenced by journal entries and cannot be deleted")
    result = await db.accounts.delete_one({"_id": object_id(account_id, "Account")})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Account not found")
