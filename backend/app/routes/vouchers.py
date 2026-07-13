from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Literal
from pymongo import ReturnDocument

from app.core.database import get_database
from app.dependencies import get_current_user, require_roles
from app.schemas import VoucherCreate
from app.utils import object_id, serialize_doc, serialize_many
from app.pagination import PageParams, SortOrder, page_response, safe_search, sort_direction

router = APIRouter(prefix="/vouchers", tags=["vouchers"])


@router.get("")
async def list_vouchers(_: dict = Depends(get_current_user)):
    docs = await get_database().vouchers.find({}).sort("date", -1).to_list(500)
    return serialize_many(docs)


@router.get("/page")
async def page_vouchers(
    params: PageParams = Depends(), search: str | None = Query(default=None, max_length=200),
    voucher_type: Literal["Payment", "Receipt", "Contra", "Sales", "Purchase", "Journal"] | None = Query(default=None, alias="type"),
    status_filter: Literal["Pending", "Approved", "Rejected"] | None = Query(default=None, alias="status"),
    date_from: str | None = None, date_to: str | None = None,
    sort_by: Literal["date", "voucher_no", "amount", "created_at"] = "date", sort_order: SortOrder = "desc",
    _: dict = Depends(get_current_user),
):
    query: dict = {}
    pattern = safe_search(search)
    if pattern:
        query["$or"] = [{field: {"$regex": pattern, "$options": "i"}} for field in ("voucher_no", "party", "narration")]
    if voucher_type: query["type"] = voucher_type
    if status_filter: query["status"] = status_filter
    if date_from or date_to: query["date"] = {**({"$gte": date_from} if date_from else {}), **({"$lte": date_to} if date_to else {})}
    db = get_database()
    total = await db.vouchers.count_documents(query)
    docs = await db.vouchers.find(query).sort(sort_by, sort_direction(sort_order)).skip(params.skip).limit(params.page_size).to_list(params.page_size)
    return page_response(docs, params, total)


@router.get("/stats")
async def voucher_stats(_: dict = Depends(get_current_user)):
    rows = await get_database().vouchers.aggregate([{"$group": {"_id": "$type", "count": {"$sum": 1}}}]).to_list(length=None)
    return {"total": sum(row["count"] for row in rows), "by_type": {row["_id"]: row["count"] for row in rows if row.get("_id")}}


@router.post("", status_code=201)
async def create_voucher(payload: VoucherCreate, current_user=Depends(require_roles("superadmin", "admin"))):
    db = get_database()
    if await db.vouchers.find_one({"voucher_no": payload.voucher_no}):
        raise HTTPException(status_code=409, detail="Voucher number already exists")
    doc = payload.model_dump(mode="json")
    doc["status"] = "Pending"
    doc["created_by"] = current_user["id"]
    doc["created_at"] = datetime.now(timezone.utc)
    result = await db.vouchers.insert_one(doc)
    return serialize_doc(await db.vouchers.find_one({"_id": result.inserted_id}))


@router.patch("/{voucher_id}/approve")
async def approve_voucher(voucher_id: str, current_user=Depends(require_roles("superadmin", "admin"))):
    result = await get_database().vouchers.find_one_and_update(
        {"_id": object_id(voucher_id, "Voucher"), "status": "Pending"},
        {"$set": {"status": "Approved", "approved_by": current_user["id"], "approved_at": datetime.now(timezone.utc)}},
        return_document=ReturnDocument.AFTER,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Voucher not found")
    return serialize_doc(result)
