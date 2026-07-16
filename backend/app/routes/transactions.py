from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from typing import Literal

from app.core.database import get_database
from app.dependencies import get_current_user, require_roles
from app.schemas import BookType, TransactionCreate
from app.utils import serialize_doc, serialize_many
from app.pagination import PageParams, SortOrder, page_response, safe_search, sort_direction

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _book_account_query(book: BookType) -> dict:
    if book == "bank":
        return {
            "type": "Asset",
            "$or": [
                {"group": {"$regex": "^bank$", "$options": "i"}},
                {"name": {"$regex": "bank", "$options": "i"}},
            ],
        }
    return {"type": "Asset", "name": {"$regex": "cash", "$options": "i"}}


@router.get("")
async def list_transactions(book: BookType | None = None, _: dict = Depends(get_current_user)):
    query = {"book": book} if book else {}
    docs = await get_database().transactions.find(query).sort("date", 1).to_list(500)
    if book:
        opening_accounts = await get_database().accounts.find(_book_account_query(book)).to_list(100)
        balance = sum(float(account.get("opening_balance", 0) or 0) for account in opening_accounts)
        for doc in docs:
            balance += float(doc.get("debit", 0) or 0) - float(doc.get("credit", 0) or 0)
            doc["balance"] = balance
    return serialize_many(docs)


@router.get("/page")
async def page_transactions(
    params: PageParams = Depends(), book: BookType | None = None,
    search: str | None = Query(default=None, max_length=200), date_from: str | None = None, date_to: str | None = None,
    transaction_type: Literal["Receipt", "Payment"] | None = Query(default=None, alias="type"),
    sort_order: SortOrder = "asc", _: dict = Depends(get_current_user),
):
    db = get_database()
    query: dict = {**({"book": book} if book else {})}
    pattern = safe_search(search)
    if pattern:
        query["$or"] = [{field: {"$regex": pattern, "$options": "i"}} for field in ("particulars", "voucher_no", "account")]
    if transaction_type: query["type"] = transaction_type
    if date_from or date_to: query["date"] = {**({"$gte": date_from} if date_from else {}), **({"$lte": date_to} if date_to else {})}
    total = await db.transactions.count_documents(query)
    direction = sort_direction(sort_order)
    docs = await db.transactions.find(query).sort([("date", direction), ("_id", direction)]).skip(params.skip).limit(params.page_size).to_list(params.page_size)
    if book and sort_order == "asc":
        opening_accounts = await db.accounts.find(_book_account_query(book)).to_list(100)
        balance = sum(float(account.get("opening_balance", 0) or 0) for account in opening_accounts)
        if params.skip:
            prior = await db.transactions.aggregate([
                {"$match": query}, {"$sort": {"date": 1, "_id": 1}}, {"$limit": params.skip},
                {"$group": {"_id": None, "debit": {"$sum": "$debit"}, "credit": {"$sum": "$credit"}}},
            ]).to_list(1)
            if prior: balance += float(prior[0].get("debit", 0)) - float(prior[0].get("credit", 0))
        for doc in docs:
            balance += float(doc.get("debit", 0) or 0) - float(doc.get("credit", 0) or 0)
            doc["balance"] = balance
    return page_response(docs, params, total)


@router.post("", status_code=201)
async def create_transaction(payload: TransactionCreate, current_user=Depends(require_roles("superadmin", "admin"))):
    db = get_database()
    doc = payload.model_dump(mode="json")
    doc["created_by"] = current_user["id"]
    doc["created_at"] = datetime.now(timezone.utc)
    result = await db.transactions.insert_one(doc)
    return serialize_doc(await db.transactions.find_one({"_id": result.inserted_id}))
