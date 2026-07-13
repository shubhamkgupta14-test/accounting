from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument

from app.core.database import get_database
from app.dependencies import get_current_user, require_roles
from app.schemas import AccountCreate, AccountUpdate
from app.utils import object_id, serialize_doc, serialize_many
from app.accounting import accounts_with_balances

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("")
async def list_accounts(_: dict = Depends(get_current_user)):
    docs = await accounts_with_balances(get_database())
    return serialize_many(docs)


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
