from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from app.core.database import get_database
from app.dependencies import get_current_user, require_roles
from app.utils import serialize_doc
from app.financial_reports import Period, build_financial_report, get_financial_year

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
    "partners": [],
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


class PartnerCapital(BaseModel):
    partner_name: str = Field(min_length=1, max_length=150)
    account_name: str = Field(min_length=1, max_length=200)
    account_code: str = Field(min_length=1, max_length=50)
    share_percentage: float = Field(ge=0, le=100)
    opening_balance: float = Field(default=0, ge=0)
    admission_date: date | None = None
    retirement_date: date | None = None
    retirement_share_percentage: float | None = Field(default=None, ge=0, le=100)

    @model_validator(mode="after")
    def validate_lifecycle(self):
        if self.retirement_date and not self.admission_date:
            raise ValueError("Admission date is required before retirement")
        if self.retirement_date and self.admission_date and self.retirement_date < self.admission_date:
            raise ValueError("Retirement date cannot be before admission date")
        if self.retirement_date and self.share_percentage != 0:
            raise ValueError("A retired partner's share must be 0%")
        if not self.retirement_date and self.share_percentage <= 0:
            raise ValueError("An active partner's share must be greater than 0%")
        return self


class PartnerSettings(BaseModel):
    partners: list[PartnerCapital] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def validate_partners(self):
        active = [row for row in self.partners if not row.retirement_date]
        if active and abs(sum(row.share_percentage for row in active) - 100) > .001:
            raise ValueError("Partner profit/loss shares must total 100%")
        names = [row.account_name.strip().lower() for row in self.partners]
        codes = [row.account_code.strip().lower() for row in self.partners]
        if len(names) != len(set(names)) or len(codes) != len(set(codes)):
            raise ValueError("Partner capital account names and codes must be unique")
        return self


async def _get_settings():
    saved = await get_database().app_settings.find_one({"_id": "global"}) or {}
    return {
        "company": {**DEFAULT_SETTINGS["company"], **saved.get("company", {})},
        "fiscal": {**DEFAULT_SETTINGS["fiscal"], **saved.get("fiscal", {})},
        "notifications": {**DEFAULT_SETTINGS["notifications"], **saved.get("notifications", {})},
        "partners": saved.get("partners", DEFAULT_SETTINGS["partners"]),
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


@router.patch("/partners")
async def update_partners(payload: PartnerSettings, _: dict = Depends(require_roles("superadmin"))):
    db = get_database()
    values = payload.model_dump(mode="json")["partners"]
    for partner in values:
        if partner["retirement_date"]:
            continue
        drawings_name = f"{partner['partner_name'].strip()} Drawings"
        drawings_code = f"{partner['account_code']}-DRAW"[:50]
        conflict = await db.accounts.find_one({
            "$or": [{"code": partner["account_code"]}, {"name": partner["account_name"]}],
            "name": {"$ne": partner["account_name"]},
        })
        if conflict:
            raise HTTPException(status_code=409, detail=f"Account code {partner['account_code']} is already in use")
        drawings_conflict = await db.accounts.find_one({
            "$or": [{"code": drawings_code}, {"name": drawings_name}],
            "name": {"$ne": drawings_name},
        })
        if drawings_conflict:
            raise HTTPException(status_code=409, detail=f"Drawings account code {drawings_code} is already in use")
        await db.accounts.update_one(
            {"name": partner["account_name"]},
            {"$set": {
                "code": partner["account_code"], "name": partner["account_name"],
                "type": "Equity", "group": "Capital", "opening_balance": partner["opening_balance"],
                "is_active": True, "partner_capital": True,
            }},
            upsert=True,
        )
        await db.accounts.update_one(
            {"name": drawings_name},
            {"$set": {
                "code": drawings_code,
                "name": drawings_name,
                "type": "Equity",
                "group": "Capital",
                "opening_balance": 0.0,
                "is_active": True,
                "partner_drawings": True,
                "partner_name": partner["partner_name"],
                "partner_capital_account": partner["account_name"],
            }},
            upsert=True,
        )
    await db.app_settings.update_one(
        {"_id": "global"},
        {"$set": {"partners": values, "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"partners": values}


class SettlementProfitPartner(BaseModel):
    account_name: str = Field(min_length=1, max_length=200)
    share_percentage: float = Field(gt=0, le=100)


class RetirementSettlementRequest(BaseModel):
    partner_name: str = Field(min_length=1, max_length=150)
    account_name: str = Field(min_length=1, max_length=200)
    account_code: str = Field(min_length=1, max_length=50)
    share_percentage: float = Field(gt=0, le=100)
    admission_date: date
    retirement_date: date
    profit_partners: list[SettlementProfitPartner] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def validate_dates(self):
        if self.retirement_date < self.admission_date:
            raise ValueError("Retirement date cannot be before admission date")
        if abs(sum(row.share_percentage for row in self.profit_partners) - 100) > .001:
            raise ValueError("Pre-retirement partner shares must total 100%")
        if self.account_name not in {row.account_name for row in self.profit_partners}:
            raise ValueError("The retiring partner must be included in the pre-retirement shares")
        return self


async def _retirement_entries(db, payload: RetirementSettlementRequest):
    fy = get_financial_year(payload.retirement_date)
    start_date = max(fy.start_date, payload.admission_date)
    statement = await build_financial_report(db, Period(start_date, payload.retirement_date))
    profit = round(float(statement["profit_and_loss"]["net_profit"]), 2)
    amount = abs(profit)
    allocations = []
    allocated = 0.0
    for index, partner in enumerate(payload.profit_partners):
        share_amount = round(amount - allocated, 2) if index == len(payload.profit_partners) - 1 else round(amount * partner.share_percentage / 100, 2)
        allocated += share_amount
        allocations.append((partner.account_name, share_amount))
    drawings_name = f"{payload.partner_name.strip()} Drawings"
    rows = await db.journal_entries.aggregate([
        {"$match": {
            "date": {"$gte": start_date.isoformat(), "$lte": payload.retirement_date.isoformat()},
            "status": "Posted",
            "system_entry_type": {"$nin": ["RETIREMENT_DRAWINGS_TRANSFER"]},
        }},
        {"$unwind": "$entries"},
        {"$match": {"entries.account": drawings_name}},
        {"$group": {"_id": None, "debit": {"$sum": "$entries.debit"}, "credit": {"$sum": "$entries.credit"}}},
    ]).to_list(length=1)
    drawings = round(
        float(rows[0].get("debit", 0) or 0) - float(rows[0].get("credit", 0) or 0), 2
    ) if rows else 0.0
    suffix = f"{payload.account_code}-{payload.retirement_date.isoformat()}"
    entries = []
    if amount >= .005:
        lines = (
            [{"account": "Profit & Loss Account", "debit": amount, "credit": 0.0}]
            + [{"account": name, "debit": 0.0, "credit": value} for name, value in allocations]
            if profit > 0 else
            [{"account": name, "debit": value, "credit": 0.0} for name, value in allocations]
            + [{"account": "Profit & Loss Account", "debit": 0.0, "credit": amount}]
        )
        entries.append({
            "system_entry_type": "RETIREMENT_PROFIT_TRANSFER",
            "voucher_no": f"RET-PL-{suffix}",
            "date": payload.retirement_date.isoformat(),
            "narration": f"Being profit/loss up to {payload.partner_name}'s retirement distributed using the pre-retirement partnership ratio.",
            "entries": lines,
        })
    if drawings >= .005:
        entries.append({
            "system_entry_type": "RETIREMENT_DRAWINGS_TRANSFER",
            "voucher_no": f"RET-DR-{suffix}",
            "date": payload.retirement_date.isoformat(),
            "narration": f"Being {payload.partner_name}'s drawings up to retirement transferred to Capital.",
            "entries": [
                {"account": payload.account_name, "debit": drawings, "credit": 0.0},
                {"account": drawings_name, "debit": 0.0, "credit": drawings},
            ],
        })
    return entries


@router.post("/partners/retirement-preview")
async def retirement_preview(payload: RetirementSettlementRequest, _: dict = Depends(require_roles("superadmin"))):
    return {"entries": await _retirement_entries(get_database(), payload)}


@router.post("/partners/retirement-confirm")
async def retirement_confirm(payload: RetirementSettlementRequest, current_user: dict = Depends(require_roles("superadmin"))):
    db = get_database()
    entries = await _retirement_entries(db, payload)
    now = datetime.now(timezone.utc)
    loan_name = f"{payload.partner_name.strip()} Loan"
    loan_code = f"{payload.account_code}-LOAN"[:50]
    loan_conflict = await db.accounts.find_one({
        "$or": [{"code": loan_code}, {"name": loan_name}],
        "name": {"$ne": loan_name},
    })
    if loan_conflict:
        raise HTTPException(status_code=409, detail=f"Partner loan account code {loan_code} is already in use")
    await db.accounts.update_one(
        {"name": loan_name},
        {
            "$set": {
                "code": loan_code, "name": loan_name, "type": "Liability",
                "group": "Current Liabilities", "is_active": True,
                "partner_loan": True, "partner_name": payload.partner_name.strip(),
                "partner_capital_account": payload.account_name,
            },
            "$setOnInsert": {"opening_balance": 0.0, "created_at": now},
        },
        upsert=True,
    )
    for document in entries:
        await db.accounts.update_one(
            {"name": "Profit & Loss Account"},
            {"$setOnInsert": {
                "code": "SYS-PNL", "name": "Profit & Loss Account", "type": "Equity",
                "group": "Capital", "opening_balance": 0.0, "is_active": True,
            }},
            upsert=True,
        )
        await db.journal_entries.update_one(
            {
                "system_entry_type": document["system_entry_type"],
                "retirement_partner_account": payload.account_name,
                "retirement_date": payload.retirement_date.isoformat(),
            },
            {"$set": {
                **document, "status": "Posted", "retirement_partner_account": payload.account_name,
                "retirement_date": payload.retirement_date.isoformat(), "posted_by": current_user["id"],
                "posted_at": now,
            }, "$setOnInsert": {"created_by": current_user["id"], "created_at": now}},
            upsert=True,
        )
    return {
        "created": len(entries),
        "entries": entries,
        "loan_account": {"name": loan_name, "code": loan_code, "type": "Liability", "group": "Current Liabilities"},
    }


class RetirementDateUpdate(BaseModel):
    account_name: str = Field(min_length=1, max_length=200)
    retirement_date: date


@router.patch("/partners/retirement-date")
async def update_retirement_date(payload: RetirementDateUpdate, current_user: dict = Depends(require_roles("superadmin"))):
    db = get_database()
    saved = await db.app_settings.find_one({"_id": "global"}, {"partners": 1}) or {}
    partners = saved.get("partners", [])
    partner = next((row for row in partners if row.get("account_name") == payload.account_name), None)
    if not partner or not partner.get("retirement_date"):
        raise HTTPException(status_code=404, detail="Retired partner not found")
    admission_date = date.fromisoformat(str(partner.get("admission_date") or ""))
    if payload.retirement_date < admission_date:
        raise HTTPException(status_code=422, detail="Retirement date cannot be before admission date")

    previous = await db.journal_entries.find_one({
        "system_entry_type": "RETIREMENT_PROFIT_TRANSFER",
        "retirement_partner_account": payload.account_name,
    }, sort=[("retirement_date", -1)])
    profit_partners = []
    if previous:
        capital_lines = [
            line for line in previous.get("entries", [])
            if line.get("account") != "Profit & Loss Account" and max(float(line.get("debit", 0) or 0), float(line.get("credit", 0) or 0)) > 0
        ]
        total = sum(max(float(line.get("debit", 0) or 0), float(line.get("credit", 0) or 0)) for line in capital_lines)
        if total:
            profit_partners = [
                SettlementProfitPartner(
                    account_name=line["account"],
                    share_percentage=max(float(line.get("debit", 0) or 0), float(line.get("credit", 0) or 0)) * 100 / total,
                )
                for line in capital_lines
            ]
    if not profit_partners:
        active_at_old_date = [
            row for row in partners
            if not row.get("retirement_date") or row.get("account_name") == payload.account_name
        ]
        profit_partners = [
            SettlementProfitPartner(
                account_name=row["account_name"],
                share_percentage=float(
                    row.get("retirement_share_percentage")
                    if row.get("account_name") == payload.account_name and row.get("retirement_share_percentage") is not None
                    else row.get("share_percentage", 0)
                ),
            )
            for row in active_at_old_date
            if float(row.get("retirement_share_percentage") or row.get("share_percentage") or 0) > 0
        ]
    settlement = RetirementSettlementRequest(
        partner_name=partner["partner_name"],
        account_name=partner["account_name"],
        account_code=partner["account_code"],
        share_percentage=float(partner.get("retirement_share_percentage") or 100),
        admission_date=admission_date,
        retirement_date=payload.retirement_date,
        profit_partners=profit_partners,
    )
    entries = await _retirement_entries(db, settlement)
    old_period = get_financial_year(date.fromisoformat(str(partner["retirement_date"])))
    new_period = get_financial_year(payload.retirement_date)
    await db.journal_entries.delete_many({
        "system_entry_type": {"$in": ["RETIREMENT_PROFIT_TRANSFER", "RETIREMENT_DRAWINGS_TRANSFER"]},
        "retirement_partner_account": payload.account_name,
    })
    await db.journal_entries.delete_many({
        "system_entry_type": {"$in": ["PROFIT_TRANSFER", "DRAWINGS_TRANSFER"]},
        "financial_year_start": {"$in": [old_period.start_date.isoformat(), new_period.start_date.isoformat()]},
    })
    now = datetime.now(timezone.utc)
    for document in entries:
        await db.journal_entries.insert_one({
            **document, "status": "Posted", "retirement_partner_account": payload.account_name,
            "retirement_date": payload.retirement_date.isoformat(), "posted_by": current_user["id"],
            "posted_at": now, "created_by": current_user["id"], "created_at": now,
        })
    for row in partners:
        if row.get("account_name") == payload.account_name:
            row["retirement_date"] = payload.retirement_date.isoformat()
    await db.app_settings.update_one(
        {"_id": "global"}, {"$set": {"partners": partners, "updated_at": now}},
    )
    return {"updated": len(entries), "entries": entries}


@router.get("/export")
async def export_data(_: dict = Depends(require_roles("superadmin"))):
    db = get_database()
    collection_names = ["accounts", "journal_entries", "vouchers", "transactions", "notifications", "app_settings"]
    data = {}
    for name in collection_names:
        documents = await db[name].find({}).to_list(length=None)
        data[name] = [serialize_doc(document) for document in documents]
    return {"exported_at": datetime.now(timezone.utc), "data": data}
