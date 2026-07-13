import pytest


@pytest.mark.parametrize("method,path,payload", [
    ("post", "/api/accounts", {"code": "NOPE", "name": "Nope", "type": "Asset", "group": "Test", "opening_balance": 0, "is_active": True}),
    ("get", "/api/settings/export", None),
    ("get", "/api/auth/users", None),
    ("get", "/api/admin/collections", None),
])
def test_viewer_cannot_access_privileged_routes(client, login, method, path, payload):
    login("user")
    response = client.request(method, path, json=payload)
    assert response.status_code == 403


def test_admin_cannot_manage_users(client, login):
    login("admin")
    assert client.get("/api/auth/users").status_code == 403


def test_superadmin_cleanup_rejects_unknown_collection(client, login):
    login("superadmin")
    response = client.post("/api/admin/clean", json={"collections": ["users.$cmd"]})
    assert response.status_code == 400


def test_admin_cannot_export_global_data(client, login):
    login("admin")
    assert client.get("/api/settings/export").status_code == 403


def test_superadmin_can_export_but_password_hashes_are_not_exported(client, login):
    login("superadmin")
    response = client.get("/api/settings/export")
    assert response.status_code == 200
    body = response.json()
    assert "users" not in body["data"]
    assert "password_hash" not in response.text


@pytest.mark.parametrize("path,payload", [
    ("/api/settings/company", {"company_name": "Nope", "gstin": "", "pan": "", "email": "", "phone": "", "business_type": "Private Limited", "registered_address": ""}),
    ("/api/settings/fiscal", {"start": "April 1", "end": "March 31", "financial_year": "2026-27", "currency": "INR", "date_format": "DD/MM/YYYY", "voucher_numbering": "auto"}),
    ("/api/settings/notifications", {"pending_vouchers": True, "daily_digest": True, "low_balance": True, "gst_reminders": True, "journal_posted": True}),
])
def test_admin_cannot_change_global_settings(client, login, path, payload):
    login("admin")
    assert client.patch(path, json=payload).status_code == 403


def test_user_cannot_read_notification_outside_audience(client, login):
    login("superadmin")
    created = client.post("/api/notifications", json={"title": "Admins", "message": "Private", "audience": "admin"})
    assert created.status_code == 201
    client.cookies.clear()
    login("user")
    assert client.patch(f"/api/notifications/{created.json()['id']}/read").status_code == 404


def test_referenced_account_cannot_be_deleted(client, login):
    login("superadmin")
    cash = next(row for row in client.get("/api/accounts").json() if row["name"] == "Cash")
    assert client.delete(f"/api/accounts/{cash['id']}").status_code == 409


def test_superadmin_can_update_and_delete_unreferenced_account(client, login):
    login("superadmin")
    created = client.post("/api/accounts", json={
        "code": "TEMP", "name": "Temporary", "type": "Expense", "group": "Test",
        "opening_balance": 0, "is_active": True,
    })
    assert created.status_code == 201
    account_id = created.json()["id"]

    updated = client.patch(f"/api/accounts/{account_id}", json={
        "code": "TEMP2", "name": "Temporary Updated", "opening_balance": 25,
    })
    assert updated.status_code == 200
    assert updated.json()["code"] == "TEMP2"
    assert updated.json()["name"] == "Temporary Updated"
    assert updated.json()["opening_balance"] == 25

    assert client.delete(f"/api/accounts/{account_id}").status_code == 204
    assert all(row["id"] != account_id for row in client.get("/api/accounts").json())


def test_voucher_creation_cannot_bypass_approval(client, login):
    login("admin")
    response = client.post("/api/vouchers", json={
        "voucher_no": "V-SECURITY-1", "date": "2026-01-03", "type": "Payment", "party": "Vendor",
        "amount": 100, "mode": "Cash", "narration": "Test", "status": "Approved",
    })
    assert response.status_code == 201
    assert response.json()["status"] == "Pending"
