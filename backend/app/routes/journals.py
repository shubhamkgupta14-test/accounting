from datetime import date, datetime, timezone
from io import BytesIO
import json

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from openpyxl import Workbook, load_workbook
from pydantic import ValidationError
from fastapi.responses import StreamingResponse
from typing import Literal
from pymongo import ReturnDocument

from app.core.database import get_database
from app.dependencies import get_current_user, require_roles
from app.schemas import JournalEntryCreate
from app.utils import object_id, serialize_doc, serialize_many
from app.pagination import PageParams, SortOrder, page_response, safe_search, sort_direction
from app.financial_reports import build_financial_report, get_financial_year

router = APIRouter(prefix="/journal-entries", tags=["journal entries"])


async def _post_profit_transfer(db, closing_date: date, current_user: dict) -> None:
    """Create or refresh the FY profit-to-capital journal after stock closing."""
    period = get_financial_year(closing_date)
    statement = await build_financial_report(db, period)
    profit = round(float(statement["profit_and_loss"]["net_profit"]), 2)
    voucher_no = f"PROFIT-TRANSFER-{period.start_date.year}-{str(period.end_date.year)[-2:]}"
    if abs(profit) < .005:
        await db.journal_entries.delete_one({"voucher_no": voucher_no, "system_entry_type": "PROFIT_TRANSFER"})
        return

    saved_settings = await db.app_settings.find_one({"_id": "global"}, {"partners": 1}) or {}
    configured_partners = saved_settings.get("partners", [])
    capital_accounts = []
    for partner in configured_partners:
        account = await db.accounts.find_one({
            "name": partner.get("account_name"), "type": "Equity", "group": "Capital"
        })
        if account:
            capital_accounts.append((account, float(partner.get("share_percentage", 0))))
    if not capital_accounts:
        capital = await db.accounts.find_one({"name": "Capital", "type": "Equity"})
        if capital is None:
            capital = await db.accounts.find_one({
                "type": "Equity", "group": "Capital", "name": {"$ne": "Profit & Loss Account"}
            }, sort=[("code", 1)])
        if capital:
            capital_accounts = [(capital, 100.0)]
    if not capital_accounts:
        raise HTTPException(status_code=400, detail="Create a Capital equity account before closing stock")

    await db.accounts.update_one(
        {"name": "Profit & Loss Account"},
        {"$setOnInsert": {
            "code": "SYS-PNL", "name": "Profit & Loss Account", "type": "Equity",
            "group": "Capital", "opening_balance": 0.0, "is_active": True,
        }},
        upsert=True,
    )
    amount = abs(profit)
    allocations = []
    allocated = 0.0
    for index, (account, share) in enumerate(capital_accounts):
        share_amount = round(amount - allocated, 2) if index == len(capital_accounts) - 1 else round(amount * share / 100, 2)
        allocated += share_amount
        allocations.append((account["name"], share_amount))
    if profit > 0:
        entries = [{"account": "Profit & Loss Account", "debit": amount, "credit": 0.0}]
        entries.extend({"account": name, "debit": 0.0, "credit": value} for name, value in allocations)
    else:
        entries = [{"account": name, "debit": value, "credit": 0.0} for name, value in allocations]
        entries.append({"account": "Profit & Loss Account", "debit": 0.0, "credit": amount})
    now = datetime.now(timezone.utc)
    await db.journal_entries.update_one(
        {"voucher_no": voucher_no},
        {"$set": {
            "date": closing_date.isoformat(),
            "narration": f"Being net {'profit' if profit > 0 else 'loss'} transferred to Capital.",
            "entries": entries, "status": "Posted", "system_entry_type": "PROFIT_TRANSFER",
            "posted_by": current_user["id"], "posted_at": now,
        }, "$setOnInsert": {"created_by": current_user["id"], "created_at": now}},
        upsert=True,
    )


async def _post_drawings_transfer(db, closing_date: date, current_user: dict) -> None:
    """Close all FY Drawings ledgers into Capital on the financial-year end."""
    period = get_financial_year(closing_date)
    voucher_no = f"DRAWINGS-TRANSFER-{period.start_date.year}-{str(period.end_date.year)[-2:]}"
    drawings_accounts = await db.accounts.find({
        "type": "Equity", "group": "Capital", "name": {"$regex": "drawings?", "$options": "i"}
    }).sort("code", 1).to_list(length=None)
    names = [account["name"] for account in drawings_accounts]
    if not names:
        await db.journal_entries.delete_one({"voucher_no": voucher_no, "system_entry_type": "DRAWINGS_TRANSFER"})
        return

    rows = await db.journal_entries.aggregate([
        {"$match": {
            "date": {"$gte": period.start_date.isoformat(), "$lte": period.end_date.isoformat()},
            "status": "Posted",
            "system_entry_type": {"$nin": ["FY_CLOSE", "DRAWINGS_TRANSFER"]},
        }},
        {"$unwind": "$entries"},
        {"$match": {"entries.account": {"$in": names}}},
        {"$group": {
            "_id": "$entries.account",
            "debit": {"$sum": "$entries.debit"},
            "credit": {"$sum": "$entries.credit"},
        }},
    ]).to_list(length=None)
    drawings = [
        (row["_id"], round(float(row.get("debit", 0) or 0) - float(row.get("credit", 0) or 0), 2))
        for row in rows
    ]
    drawings = [(name, amount) for name, amount in drawings if amount >= .005]
    total = round(sum(amount for _, amount in drawings), 2)
    if total < .005:
        await db.journal_entries.delete_one({"voucher_no": voucher_no, "system_entry_type": "DRAWINGS_TRANSFER"})
        return

    capital = await db.accounts.find_one({"name": "Capital", "type": "Equity"})
    if capital is None:
        raise HTTPException(status_code=400, detail="Create a Capital equity account before closing drawings")
    entries = [{"account": capital["name"], "debit": total, "credit": 0.0}]
    entries.extend(
        {"account": name, "debit": 0.0, "credit": amount}
        for name, amount in drawings
    )
    now = datetime.now(timezone.utc)
    await db.journal_entries.update_one(
        {"voucher_no": voucher_no},
        {"$set": {
            "date": period.end_date.isoformat(),
            "narration": "Being drawings transferred to Capital at financial year end.",
            "entries": entries, "status": "Posted", "system_entry_type": "DRAWINGS_TRANSFER",
            "posted_by": current_user["id"], "posted_at": now,
        }, "$setOnInsert": {"created_by": current_user["id"], "created_at": now}},
        upsert=True,
    )


def _is_closing_stock(payload: JournalEntryCreate) -> bool:
    closing_names = {"closing stock", "stock-in-hand", "stock in hand"}
    return any(line.account.strip().lower() in closing_names and line.debit > 0 for line in payload.entries)


def _excel_date(value) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value or "").strip()
    for pattern in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(text, pattern).date()
        except ValueError:
            continue
    raise ValueError(f"Invalid date '{text}'")


def _header(value) -> str:
    return "_".join(str(value or "").strip().lower().replace("/", " ").replace("-", " ").split())


def _suggest_account(name: str, index: int) -> dict:
    text = name.lower()
    if any(word in text for word in ("sale", "income", "commission", "interest received")):
        account_type, group = "Income", "Indirect Income"
    elif any(word in text for word in ("expense", "purchase", "rent", "salary", "wages", "charges")):
        account_type, group = "Expense", "Indirect Expenses"
    elif any(word in text for word in ("payable", "creditor", "loan", "liability")):
        account_type, group = "Liability", "Current Liabilities"
    elif any(word in text for word in ("capital", "drawings", "equity")):
        account_type, group = "Equity", "Capital"
    else:
        account_type, group = "Asset", "Current Assets"
    return {"source_name": name, "name": name, "code": f"IMP-{index:03d}", "type": account_type, "group": group}


def _excel_account_names(content: bytes) -> set[str]:
    workbook = load_workbook(BytesIO(content), read_only=True, data_only=True)
    rows = workbook.active.iter_rows(values_only=True)
    headers = [_header(value) for value in next(rows)]
    candidates = {"account", "account_name", "ledger", "ledger_name"}
    column = next((headers.index(name) for name in candidates if name in headers), None)
    if column is None:
        raise ValueError("Missing Excel column: account")
    return {str(row[column]).strip() for row in rows if column < len(row) and row[column] not in (None, "")}


async def _validate_accounts(payload: JournalEntryCreate) -> None:
    db = get_database()
    account_names = {line.account for line in payload.entries}
    existing_accounts = await db.accounts.find(
        {"name": {"$in": list(account_names)}}
    ).to_list(500)
    existing_names = {account["name"] for account in existing_accounts}
    missing_accounts = sorted(account_names - existing_names)
    if missing_accounts:
        raise HTTPException(
            status_code=400,
            detail=f"Create/select valid accounts before posting this journal entry: {', '.join(missing_accounts)}",
        )


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
    sort_by: Literal["date", "voucher_no"] = "date",
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
    direction = sort_direction(sort_order)
    sort_fields = [(sort_by, direction)]
    # Accounting date controls chronology. _id is only a same-date tie-breaker
    # so the most recently inserted entry for that date appears first.
    sort_fields.append(("_id", -1))
    docs = await db.journal_entries.find(query).sort(sort_fields).skip(params.skip).limit(params.page_size).to_list(params.page_size)
    return page_response(docs, params, total)


@router.post("", status_code=201)
async def create_journal_entry(payload: JournalEntryCreate, current_user=Depends(require_roles("superadmin", "admin"))):
    db = get_database()
    if await db.journal_entries.find_one({"voucher_no": payload.voucher_no}):
        raise HTTPException(status_code=409, detail="Voucher number already exists")
    await _validate_accounts(payload)
    doc = payload.model_dump(mode="json")
    doc["status"] = "Posted"
    doc["created_by"] = current_user["id"]
    doc["created_at"] = datetime.now(timezone.utc)
    doc["posted_by"] = current_user["id"]
    doc["posted_at"] = datetime.now(timezone.utc)
    result = await db.journal_entries.insert_one(doc)
    if _is_closing_stock(payload):
        await _post_profit_transfer(db, payload.date, current_user)
        await _post_drawings_transfer(db, payload.date, current_user)
    return serialize_doc(await db.journal_entries.find_one({"_id": result.inserted_id}))


@router.post("/import-excel", status_code=201)
async def import_journal_entries_excel(
    file: UploadFile = File(...),
    account_definitions: str | None = Form(default=None),
    current_user=Depends(require_roles("superadmin", "admin")),
):
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Upload an Excel .xlsx or .xlsm file")
    content = await file.read()
    try:
        definitions = json.loads(account_definitions) if account_definitions else []
        if not isinstance(definitions, list):
            raise ValueError("account_definitions must be a list")
        workbook = load_workbook(BytesIO(content), read_only=True, data_only=True)
        sheet = workbook.active
        rows = sheet.iter_rows(values_only=True)
        headers = [_header(value) for value in next(rows)]
    except (json.JSONDecodeError, StopIteration, ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail="Unable to read the Excel workbook") from exc
    mappings = {str(item.get("source_name", "")).strip(): item for item in definitions if isinstance(item, dict)}

    aliases = {
        "voucher_no": {"voucher_no", "voucher", "voucher_number", "voucher_no."},
        "date": {"date", "entry_date", "voucher_date"},
        "narration": {"narration", "description", "particulars"},
        "account": {"account", "account_name", "ledger", "ledger_name"},
        "debit": {"debit", "dr", "debit_amount"},
        "credit": {"credit", "cr", "credit_amount"},
    }
    columns = {field: next((headers.index(name) for name in names if name in headers), None) for field, names in aliases.items()}
    missing = [field for field, index in columns.items() if index is None]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing Excel columns: {', '.join(missing)}")

    grouped: dict[str, dict] = {}
    current_voucher = ""
    errors: list[str] = []
    for row_number, values in enumerate(rows, start=2):
        if not any(value not in (None, "") for value in values):
            continue
        def cell(field: str):
            index = columns[field]
            return values[index] if index is not None and index < len(values) else None
        voucher = str(cell("voucher_no") or "").strip() or current_voucher
        if not voucher:
            errors.append(f"Row {row_number}: Voucher No. is required")
            continue
        current_voucher = voucher
        item = grouped.setdefault(voucher, {"date": None, "narration": "", "entries": [], "rows": []})
        try:
            if cell("date") not in (None, ""):
                parsed_date = _excel_date(cell("date"))
                if item["date"] and item["date"] != parsed_date:
                    raise ValueError("different dates used for the same voucher")
                item["date"] = parsed_date
            narration = str(cell("narration") or "").strip()
            if narration:
                item["narration"] = narration
            source_account = str(cell("account") or "").strip()
            account = str(mappings.get(source_account, {}).get("name", source_account)).strip()
            debit = float(cell("debit") or 0)
            credit = float(cell("credit") or 0)
            item["entries"].append({"account": account, "debit": debit, "credit": credit})
            item["rows"].append(row_number)
        except (TypeError, ValueError) as exc:
            errors.append(f"Row {row_number}: {exc}")

    payloads: list[JournalEntryCreate] = []
    for voucher, item in grouped.items():
        if not item["date"]:
            errors.append(f"Voucher {voucher}: Date is required on its first row")
            continue
        if not item["narration"]:
            errors.append(f"Voucher {voucher}: Narration is required")
            continue
        try:
            payloads.append(JournalEntryCreate(
                date=item["date"], voucher_no=voucher, narration=item["narration"],
                entries=item["entries"], status="Posted",
            ))
        except ValidationError as exc:
            message = "; ".join(error["msg"] for error in exc.errors())
            errors.append(f"Voucher {voucher}: {message}")
            continue
        debit = sum(line.debit for line in payloads[-1].entries)
        credit = sum(line.credit for line in payloads[-1].entries)
        if abs(debit - credit) >= .005 or debit <= 0:
            payloads.pop()
            errors.append(f"Voucher {voucher}: Debit {debit:g} and Credit {credit:g} must match")

    db = get_database()
    voucher_numbers = [payload.voucher_no for payload in payloads]
    duplicates_in_file = sorted({number for number in voucher_numbers if voucher_numbers.count(number) > 1})
    existing = await db.journal_entries.distinct("voucher_no", {"voucher_no": {"$in": voucher_numbers}})
    account_names = {line.account for payload in payloads for line in payload.entries}
    saved_accounts = set(await db.accounts.distinct("name", {"name": {"$in": list(account_names)}}))
    proposed_accounts = {str(item.get("name", "")).strip() for item in definitions}
    missing_accounts = sorted(account_names - saved_accounts - proposed_accounts)
    existing_codes = set(await db.accounts.distinct("code", {"code": {"$in": [str(item.get("code", "")).strip() for item in definitions]}}))
    if duplicates_in_file:
        errors.append(f"Duplicate vouchers in file: {', '.join(duplicates_in_file)}")
    if existing:
        errors.append(f"Voucher numbers already exist: {', '.join(sorted(existing))}")
    if missing_accounts:
        errors.append(f"Unknown accounts: {', '.join(missing_accounts)}")
    for item in definitions:
        if not all(str(item.get(field, "")).strip() for field in ("source_name", "name", "code", "type", "group")):
            errors.append("Every new ledger requires source name, name, code, type and group")
        if item.get("type") not in {"Asset", "Liability", "Equity", "Income", "Expense"}:
            errors.append(f"Invalid ledger type for {item.get('name', 'unknown ledger')}")
    if existing_codes:
        errors.append(f"Ledger codes already exist: {', '.join(sorted(existing_codes))}")
    if errors:
        raise HTTPException(status_code=422, detail=errors[:50])
    if not payloads:
        raise HTTPException(status_code=400, detail="The workbook contains no journal entries")

    now = datetime.now(timezone.utc)
    if definitions:
        await db.accounts.insert_many([{
            "code": str(item["code"]).strip(), "name": str(item["name"]).strip(),
            "type": item["type"], "group": str(item["group"]).strip(),
            "opening_balance": 0.0, "is_active": True, "created_at": now,
        } for item in definitions])
    documents = []
    for payload in payloads:
        document = payload.model_dump(mode="json")
        document.update({"status": "Posted", "created_by": current_user["id"], "created_at": now, "posted_by": current_user["id"], "posted_at": now, "import_source": file.filename})
        documents.append(document)
    await db.journal_entries.insert_many(documents)
    return {"imported": len(documents), "voucher_numbers": voucher_numbers, "line_count": sum(len(item.entries) for item in payloads)}


@router.post("/import-excel/preview")
async def preview_journal_excel(
    file: UploadFile = File(...),
    _: dict = Depends(require_roles("superadmin", "admin")),
):
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Upload an Excel .xlsx or .xlsm file")
    try:
        names = _excel_account_names(await file.read())
    except (StopIteration, ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc) or "Unable to read workbook") from exc
    existing = set(await get_database().accounts.distinct("name", {"name": {"$in": list(names)}}))
    unknown = sorted(names - existing)
    return {"unknown_ledgers": [_suggest_account(name, index) for index, name in enumerate(unknown, start=1)]}


@router.get("/import-excel/sample")
async def journal_import_sample(_: dict = Depends(get_current_user)):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Journal Entries"
    sheet.append(["Voucher No", "Date", "Narration", "Account", "Debit", "Credit"])
    sheet.append(["SAMPLE-2-LINE", "2026-04-01", "Two-line journal entry sample", "Cash", 1000, 0])
    sheet.append(["", "", "", "Sales", 0, 1000])
    sheet.append(["SAMPLE-3-LINE", "2026-04-02", "Three-line journal entry sample", "Cash", 600, 0])
    sheet.append(["", "", "", "Bank Account", 400, 0])
    sheet.append(["", "", "", "Capital", 0, 1000])
    sheet.freeze_panes = "A2"
    widths = {"A": 20, "B": 14, "C": 34, "D": 24, "E": 14, "F": 14}
    for column, width in widths.items():
        sheet.column_dimensions[column].width = width
    content = BytesIO()
    workbook.save(content)
    content.seek(0)
    return StreamingResponse(
        content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="journal-entry-import-sample.xlsx"'},
    )


@router.put("/{entry_id}")
async def update_journal_entry(
    entry_id: str,
    payload: JournalEntryCreate,
    current_user=Depends(require_roles("superadmin", "admin")),
):
    db = get_database()
    entry_object_id = object_id(entry_id, "Journal entry")
    existing = await db.journal_entries.find_one({"_id": entry_object_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    duplicate = await db.journal_entries.find_one({
        "voucher_no": payload.voucher_no,
        "_id": {"$ne": entry_object_id},
    })
    if duplicate:
        raise HTTPException(status_code=409, detail="Voucher number already exists")
    await _validate_accounts(payload)

    values = payload.model_dump(mode="json")
    values["status"] = "Posted"
    values.update({
        "updated_by": current_user["id"],
        "updated_at": datetime.now(timezone.utc),
    })
    update: dict = {"$set": values}
    if existing.get("status") != "Posted":
        values.update({
            "posted_by": current_user["id"],
            "posted_at": datetime.now(timezone.utc),
        })
    result = await db.journal_entries.find_one_and_update(
        {"_id": entry_object_id}, update, return_document=ReturnDocument.AFTER
    )
    return serialize_doc(result)


@router.delete("/{entry_id}", status_code=204)
async def delete_journal_entry(
    entry_id: str,
    _: dict = Depends(require_roles("superadmin", "admin")),
):
    db = get_database()
    entry_object_id = object_id(entry_id, "Journal entry")
    result = await db.journal_entries.delete_one({"_id": entry_object_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Journal entry not found")


@router.patch("/{entry_id}/post")
async def post_journal_entry(entry_id: str, _: dict = Depends(require_roles("superadmin", "admin"))):
    result = await get_database().journal_entries.find_one_and_update(
        {"_id": object_id(entry_id, "Journal entry"), "status": "Draft"}, {"$set": {"status": "Posted", "posted_at": datetime.now(timezone.utc)}}, return_document=ReturnDocument.AFTER
    )
    if not result:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    return serialize_doc(result)
