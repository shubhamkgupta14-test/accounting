from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.database import get_database
from app.dependencies import get_current_user, require_roles
from app.utils import serialize_doc

router = APIRouter(prefix="/settings", tags=["settings"])

DEFAULT_SETTINGS = {
    "company": {
        "company_name": "Accounting Enterprises",
        "gstin": "",
        "pan": "",
        "email": "",
        "phone": "",
        "business_type": "Private Limited",
        "registered_address": "",
    },
    "fiscal": {
        "start": "April 1",
        "end": "March 31",
        "financial_year": "2026-27",
        "currency": "INR",
        "date_format": "DD/MM/YYYY",
        "voucher_numbering": "auto",
    },
    "notifications": {
        "pending_vouchers": True,
        "daily_digest": True,
        "low_balance": True,
        "gst_reminders": True,
        "journal_posted": True,
    },
}


class CompanySettings(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)
    gstin: str = ""
    pan: str = ""
    email: str = ""
    phone: str = ""
    business_type: str = "Private Limited"
    registered_address: str = ""


class FiscalSettings(BaseModel):
    start: str
    end: str
    financial_year: str = Field(min_length=4, max_length=20)
    currency: str
    date_format: str
    voucher_numbering: str


class NotificationSettings(BaseModel):
    pending_vouchers: bool
    daily_digest: bool
    low_balance: bool
    gst_reminders: bool
    journal_posted: bool


async def _get_settings():
    saved = await get_database().app_settings.find_one({"_id": "global"}) or {}
    return {
        "company": {**DEFAULT_SETTINGS["company"], **saved.get("company", {})},
        "fiscal": {**DEFAULT_SETTINGS["fiscal"], **saved.get("fiscal", {})},
        "notifications": {**DEFAULT_SETTINGS["notifications"], **saved.get("notifications", {})},
    }


@router.get("")
async def get_settings(_: dict = Depends(get_current_user)):
    return await _get_settings()


@router.patch("/company")
async def update_company(payload: CompanySettings, _: dict = Depends(require_roles("superadmin"))):
    values = payload.model_dump()
    await get_database().app_settings.update_one(
        {"_id": "global"},
        {"$set": {"company": values, "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return values


@router.patch("/fiscal")
async def update_fiscal(payload: FiscalSettings, _: dict = Depends(require_roles("superadmin"))):
    values = payload.model_dump()
    await get_database().app_settings.update_one(
        {"_id": "global"},
        {"$set": {"fiscal": values, "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return values


@router.patch("/notifications")
async def update_notifications(payload: NotificationSettings, _: dict = Depends(require_roles("superadmin"))):
    values = payload.model_dump()
    await get_database().app_settings.update_one(
        {"_id": "global"}, {"$set": {"notifications": values, "updated_at": datetime.now(timezone.utc)}}, upsert=True
    )
    return values


@router.get("/export")
async def export_data(_: dict = Depends(require_roles("superadmin"))):
    db = get_database()
    collection_names = ["accounts", "journal_entries", "vouchers", "transactions", "notifications", "app_settings"]
    data = {}
    for name in collection_names:
        documents = await db[name].find({}).to_list(length=None)
        data[name] = [serialize_doc(document) for document in documents]
    return {"exported_at": datetime.now(timezone.utc), "data": data}
