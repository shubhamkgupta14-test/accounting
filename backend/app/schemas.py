from datetime import date
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, model_validator

Role = Literal["superadmin", "admin", "user"]
AccountType = Literal["Asset", "Liability", "Equity", "Income", "Expense"]
EntryStatus = Literal["Draft", "Posted"]
VoucherType = Literal["Payment", "Receipt", "Contra", "Sales", "Purchase", "Journal"]
VoucherStatus = Literal["Pending", "Approved", "Rejected"]
BookType = Literal["cash", "bank"]
TxnType = Literal["Receipt", "Payment"]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    role: Role = "user"


class CompanyCreate(BaseModel):
    name: str
    gstin: str | None = None
    pan: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    address: str | None = None
    business_type: str = "Private Limited"
    fiscal_year: str = "2025-26"
    currency: str = "INR"


class AccountCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=150)
    type: AccountType
    group: str
    opening_balance: float = Field(default=0, allow_inf_nan=False)
    is_active: bool = True


class AccountUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=50, pattern=r"^[A-Za-z0-9_-]+$")
    name: str | None = None
    type: AccountType | None = None
    group: str | None = None
    opening_balance: float | None = Field(default=None, allow_inf_nan=False)
    is_active: bool | None = None


class JournalLine(BaseModel):
    account: str = Field(min_length=1)
    debit: float = Field(default=0, ge=0, allow_inf_nan=False)
    credit: float = Field(default=0, ge=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def validate_one_side(self):
        if self.debit == 0 and self.credit == 0:
            raise ValueError("Each journal line must have a debit or credit amount")
        if self.debit > 0 and self.credit > 0:
            raise ValueError("A journal line cannot have both debit and credit amounts")
        return self


class JournalEntryCreate(BaseModel):
    date: date
    voucher_no: str = Field(min_length=1, max_length=100)
    narration: str = Field(min_length=1, max_length=2000)
    entries: list[JournalLine] = Field(min_length=2)
    status: EntryStatus = "Draft"

    @model_validator(mode="after")
    def validate_balanced(self):
        debit = sum(row.debit for row in self.entries)
        credit = sum(row.credit for row in self.entries)
        if debit <= 0 or round(debit, 2) != round(credit, 2):
            raise ValueError("Journal entry must be balanced")
        return self


class VoucherCreate(BaseModel):
    voucher_no: str = Field(min_length=1, max_length=100)
    date: date
    type: VoucherType
    party: str = Field(min_length=1, max_length=200)
    amount: float = Field(gt=0, allow_inf_nan=False)
    mode: str = Field(min_length=1, max_length=100)
    narration: str = Field(max_length=2000)
    status: VoucherStatus = "Pending"


class VoucherUpdate(BaseModel):
    voucher_no: str = Field(min_length=1, max_length=100)
    date: date
    type: VoucherType
    party: str = Field(min_length=1, max_length=200)
    amount: float = Field(gt=0, allow_inf_nan=False)
    mode: str = Field(min_length=1, max_length=100)
    narration: str = Field(max_length=2000)


class TransactionCreate(BaseModel):
    book: BookType
    date: date
    particulars: str = Field(min_length=1, max_length=500)
    voucher_no: str = Field(min_length=1, max_length=100)
    type: TxnType
    debit: float = Field(default=0, ge=0, allow_inf_nan=False)
    credit: float = Field(default=0, ge=0, allow_inf_nan=False)
    account: str | None = None

    @model_validator(mode="after")
    def validate_one_side(self):
        if (self.debit == 0) == (self.credit == 0):
            raise ValueError("Transaction must have either a debit or a credit amount")
        return self
