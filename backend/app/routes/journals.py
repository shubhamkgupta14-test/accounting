from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Literal
from pymongo import ReturnDocument

from app.core.database import get_database
from app.dependencies import get_current_user, require_roles
from app.schemas import JournalEntryCreate
from app.utils import object_id, serialize_doc, serialize_many
from app.pagination import PageParams, SortOrder, page_response, safe_search, sort_direction

router = APIRouter(prefix="/journal-entries", tags=["journal entries"])


@router.get("")
async def list_journal_entries(_: dict = Depends(get_current_user)):
    docs = await get_database().journal_entries.find({}).sort("date", -1).to_list(500)
    return serialize_many(docs)


@router.get("/page")
async def page_journal_entries(
    params: PageParams = Depends(),
    search: str | None = Query(default=None, max_length=200),
    status_filter: Literal["Draft", "Posted"] | None = Query(default=None, alias="status"),
    date_from: str | None = None,
    date_to: str | None = None,
    sort_by: Literal["date", "voucher_no", "created_at"] = "date",
    sort_order: SortOrder = "desc",
    _: dict = Depends(get_current_user),
):
    query: dict = {}
    pattern = safe_search(search)
    if pattern:
        query["$or"] = [{"voucher_no": {"$regex": pattern, "$options": "i"}}, {"narration": {"$regex": pattern, "$options": "i"}}]
    if status_filter:
        query["status"] = status_filter
    if date_from or date_to:
        query["date"] = {**({"$gte": date_from} if date_from else {}), **({"$lte": date_to} if date_to else {})}
    db = get_database()
    total = await db.journal_entries.count_documents(query)
    docs = await db.journal_entries.find(query).sort(sort_by, sort_direction(sort_order)).skip(params.skip).limit(params.page_size).to_list(params.page_size)
    return page_response(docs, params, total)


@router.post("", status_code=201)
async def create_journal_entry(payload: JournalEntryCreate, current_user=Depends(require_roles("superadmin", "admin"))):
    db = get_database()
    if await db.journal_entries.find_one({"voucher_no": payload.voucher_no}):
        raise HTTPException(status_code=409, detail="Voucher number already exists")
    account_names = {line.account for line in payload.entries}
    existing_accounts = await db.accounts.find({"name": {"$in": list(account_names)}}).to_list(500)
    existing_names = {account["name"] for account in existing_accounts}
    missing_accounts = sorted(account_names - existing_names)
    if missing_accounts:
        raise HTTPException(
            status_code=400,
            detail=f"Create/select valid accounts before posting this journal entry: {', '.join(missing_accounts)}",
        )
    doc = payload.model_dump(mode="json")
    doc["created_by"] = current_user["id"]
    doc["created_at"] = datetime.now(timezone.utc)
    if doc["status"] == "Posted":
        doc["posted_by"] = current_user["id"]
        doc["posted_at"] = datetime.now(timezone.utc)
    result = await db.journal_entries.insert_one(doc)
    return serialize_doc(await db.journal_entries.find_one({"_id": result.inserted_id}))


@router.patch("/{entry_id}/post")
async def post_journal_entry(entry_id: str, _: dict = Depends(require_roles("superadmin", "admin"))):
    result = await get_database().journal_entries.find_one_and_update(
        {"_id": object_id(entry_id, "Journal entry"), "status": "Draft"}, {"$set": {"status": "Posted", "posted_at": datetime.now(timezone.utc)}}, return_document=ReturnDocument.AFTER
    )
    if not result:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    return serialize_doc(result)
