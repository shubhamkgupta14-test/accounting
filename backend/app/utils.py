from datetime import date, datetime
from typing import Any

from bson import ObjectId
from fastapi import HTTPException


def object_id(value: str, resource: str = "Resource") -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=404, detail=f"{resource} not found")
    return ObjectId(value)


def serialize_doc(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    if doc is None:
        return None
    output: dict[str, Any] = {}
    for key, value in doc.items():
        if key == "_id":
            output["id"] = str(value)
        elif isinstance(value, ObjectId):
            output[key] = str(value)
        elif isinstance(value, (datetime, date)):
            output[key] = value.isoformat()
        elif isinstance(value, list):
            output[key] = [serialize_value(item) for item in value]
        elif isinstance(value, dict):
            output[key] = {k: serialize_value(v) for k, v in value.items()}
        else:
            output[key] = value
    return output


def serialize_value(value: Any) -> Any:
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return serialize_doc(value)
    if isinstance(value, list):
        return [serialize_value(item) for item in value]
    return value


def serialize_many(docs) -> list[dict[str, Any]]:
    return [serialize_doc(doc) for doc in docs]
