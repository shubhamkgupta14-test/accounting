import pytest
from io import BytesIO
from openpyxl import Workbook


OBJECT_ID = "507f1f77bcf86cd799439011"
ACCOUNT = {
    "code": "SEC-ROUTE",
    "name": "Security Route Test",
    "type": "Asset",
    "group": "Current Assets",
    "opening_balance": 0,
    "is_active": True,
}
JOURNAL = {
    "date": "2026-07-20",
    "voucher_no": "SEC-ROUTE-JE",
    "narration": "Authorization matrix test",
    "status": "Posted",
    "entries": [
        {"account": "Cash", "debit": 1, "credit": 0},
        {"account": "Capital", "debit": 0, "credit": 1},
    ],
}
VOUCHER = {
    "date": "2026-07-20",
    "voucher_no": "SEC-ROUTE-V",
    "type": "Payment",
    "party": "Security Test",
    "amount": 1,
    "mode": "Cash",
    "narration": "Authorization matrix test",
}


@pytest.mark.parametrize(("method", "path", "kwargs"), [
    ("post", "/api/accounts", {"json": ACCOUNT}),
    ("patch", f"/api/accounts/{OBJECT_ID}", {"json": {"name": "No Access"}}),
    ("delete", f"/api/accounts/{OBJECT_ID}", {}),
    ("post", "/api/journal-entries", {"json": JOURNAL}),
    ("put", f"/api/journal-entries/{OBJECT_ID}", {"json": JOURNAL}),
    ("delete", f"/api/journal-entries/{OBJECT_ID}", {}),
    ("patch", f"/api/journal-entries/{OBJECT_ID}/post", {}),
    ("get", "/api/journal-entries/closing-preview?closing_date=2026-03-31", {}),
    ("post", "/api/journal-entries/closing-confirm", {"json": {"closing_date": "2026-03-31", "entries": []}}),
    ("post", "/api/vouchers", {"json": VOUCHER}),
    ("put", f"/api/vouchers/{OBJECT_ID}", {"json": VOUCHER}),
    ("delete", f"/api/vouchers/{OBJECT_ID}", {}),
    ("patch", f"/api/vouchers/{OBJECT_ID}/approve", {}),
    ("post", "/api/transactions", {"json": {
        "book": "cash", "date": "2026-07-20", "particulars": "Security Test",
        "voucher_no": "SEC-ROUTE-T", "type": "Receipt", "debit": 1, "credit": 0,
    }}),
])
def test_read_only_user_cannot_call_writer_routes(client, login, method, path, kwargs):
    login("user")
    response = client.request(method, path, **kwargs)
    assert response.status_code == 403


def test_read_only_user_cannot_import_journals(client, login):
    login("user")
    workbook = Workbook()
    workbook.active.append(["Voucher No", "Date", "Narration", "Account", "Debit", "Credit"])
    content = BytesIO()
    workbook.save(content)
    upload = ("security-test.xlsx", content.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    assert client.post("/api/journal-entries/import-excel/preview", files={"file": upload}).status_code == 403
    assert client.post("/api/journal-entries/import-excel", files={"file": upload}).status_code == 403
    assert client.get("/api/journal-entries/pending-closing-preview").status_code == 403


@pytest.mark.parametrize(("method", "path", "kwargs"), [
    ("delete", f"/api/accounts/{OBJECT_ID}", {}),
    ("get", "/api/auth/users", {}),
    ("get", "/api/auth/users/page", {}),
    ("post", "/api/auth/users", {"json": {
        "first_name": "Security", "last_name": "Test",
        "email": "security-route@example.com", "password": "password123",
        "role": "user",
    }}),
    ("patch", f"/api/auth/users/{OBJECT_ID}/status?is_active=false", {}),
    ("delete", f"/api/auth/users/{OBJECT_ID}", {}),
    ("post", "/api/content", {"json": [{
        "page": "dashboard", "title": "No Access", "description": "No Access",
    }]}),
    ("post", "/api/notifications", {"json": {
        "title": "No Access", "message": "No Access", "audience": "all",
    }}),
    ("patch", "/api/settings/company", {"json": {
        "company_name": "No Access", "gstin": "", "pan": "", "email": "",
        "phone": "", "business_type": "Private Limited", "registered_address": "",
    }}),
    ("patch", "/api/settings/fiscal", {"json": {
        "start": "April 1", "end": "March 31", "financial_year": "2026-27",
        "currency": "INR", "date_format": "DD/MM/YYYY", "voucher_numbering": "auto",
    }}),
    ("patch", "/api/settings/notifications", {"json": {
        "pending_vouchers": True, "daily_digest": True, "low_balance": True,
        "gst_reminders": True, "journal_posted": True,
    }}),
    ("patch", "/api/settings/partners", {"json": {"partners": []}}),
    ("post", "/api/settings/partners/retirement-preview", {"json": {
        "partner_name": "No Access", "account_name": "No Access Capital",
        "account_code": "NO-ACCESS", "share_percentage": 100,
        "admission_date": "2026-04-01", "retirement_date": "2026-07-20",
        "profit_partners": [{"account_name": "No Access Capital", "share_percentage": 100}],
    }}),
    ("post", "/api/settings/partners/retirement-confirm", {"json": {
        "partner_name": "No Access", "account_name": "No Access Capital",
        "account_code": "NO-ACCESS", "share_percentage": 100,
        "admission_date": "2026-04-01", "retirement_date": "2026-07-20",
        "profit_partners": [{"account_name": "No Access Capital", "share_percentage": 100}],
    }}),
    ("patch", "/api/settings/partners/retirement-date", {"json": {
        "account_name": "No Access Capital", "retirement_date": "2026-07-20",
    }}),
    ("get", "/api/settings/export", {}),
    ("get", "/api/admin/collections", {}),
    ("post", "/api/admin/clean", {"json": {
        "collections": ["vouchers"], "password": "password123",
    }}),
])
def test_admin_cannot_call_superadmin_routes(client, login, method, path, kwargs):
    login("admin")
    response = client.request(method, path, **kwargs)
    assert response.status_code == 403
