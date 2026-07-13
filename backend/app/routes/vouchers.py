from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument

from app.core.database import get_database
from app.dependencies import get_current_user, require_roles
from app.schemas import VoucherCreate
from app.utils import object_id, serialize_doc, serialize_many

router = APIRouter(prefix="/vouchers", tags=["vouchers"])


@router.get("")
async def list_vouchers(_: dict = Depends(get_current_user)):
    docs = await get_database().vouchers.find({}).sort("date", -1).to_list(500)
    return serialize_many(docs)


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
