from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app.core.database import get_database
from app.dependencies import get_current_user, require_roles
from app.schemas import BookType, TransactionCreate
from app.utils import serialize_doc, serialize_many

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("")
async def list_transactions(book: BookType | None = None, _: dict = Depends(get_current_user)):
    query = {"book": book} if book else {}
    docs = await get_database().transactions.find(query).sort("date", 1).to_list(500)
    if book:
        account_query = {"type": "Asset", "group": "Bank"} if book == "bank" else {"type": "Asset", "name": {"$regex": "cash", "$options": "i"}}
        opening_accounts = await get_database().accounts.find(account_query).to_list(100)
        balance = sum(float(account.get("opening_balance", 0) or 0) for account in opening_accounts)
        for doc in docs:
            balance += float(doc.get("debit", 0) or 0) - float(doc.get("credit", 0) or 0)
            doc["balance"] = balance
    return serialize_many(docs)


@router.post("", status_code=201)
async def create_transaction(payload: TransactionCreate, current_user=Depends(require_roles("superadmin", "admin"))):
    db = get_database()
    doc = payload.model_dump(mode="json")
    doc["created_by"] = current_user["id"]
    doc["created_at"] = datetime.now(timezone.utc)
    result = await db.transactions.insert_one(doc)
    return serialize_doc(await db.transactions.find_one({"_id": result.inserted_id}))
