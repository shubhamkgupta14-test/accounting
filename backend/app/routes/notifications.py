from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from typing import Literal
from pydantic import BaseModel, Field

from app.core.database import get_database
from app.dependencies import get_current_user, require_roles
from app.utils import object_id, serialize_doc, serialize_many

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotificationCreate(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    message: str = Field(min_length=1, max_length=2000)
    audience: Literal["all", "superadmin", "admin", "user"] = "all"


@router.get("")
async def list_notifications(current_user=Depends(get_current_user)):
    query = {"$or": [{"audience": "all"}, {"audience": current_user["role"]}, {"user_id": current_user["id"]}]}
    docs = await get_database().notifications.find(query).sort("created_at", -1).to_list(100)
    return serialize_many(docs)


@router.post("", status_code=201)
async def create_notification(payload: NotificationCreate, current_user=Depends(require_roles("superadmin"))):
    doc = {
        "title": payload.title,
        "message": payload.message,
        "audience": payload.audience,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc),
    }
    result = await get_database().notifications.insert_one(doc)
    return serialize_doc(await get_database().notifications.find_one({"_id": result.inserted_id}))


@router.patch("/{notification_id}/read")
async def mark_read(notification_id: str, current_user=Depends(get_current_user)):
    db = get_database()
    visibility = {"_id": object_id(notification_id, "Notification"), "$or": [{"audience": "all"}, {"audience": current_user["role"]}, {"user_id": current_user["id"]}]}
    notification = await db.notifications.find_one(visibility)
    if not notification:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Notification not found")
    await db.notification_reads.update_one(
        {"notification_id": notification_id, "user_id": current_user["id"]},
        {"$set": {"read_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return serialize_doc(notification)
