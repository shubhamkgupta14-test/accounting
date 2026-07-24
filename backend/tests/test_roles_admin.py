import pytest


@pytest.mark.parametrize("method,path,payload", [
    ("post", "/api/accounts", {"code": "NOPE", "name": "Nope", "type": "Asset", "group": "Test", "opening_balance": 0, "is_active": True}),
    ("post", "/api/admin/default-accounts", None),
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
    response = client.post("/api/admin/clean", json={
        "collections": ["users.$cmd"],
        "password": "password123",
    })
    assert response.status_code == 400


def test_cleanup_defaults_to_transactional_collections(client, login):
    login("superadmin")
    response = client.get("/api/admin/collections")
    assert response.status_code == 200
    rows = response.json()
    assert {row["name"] for row in rows if row["default_selected"]} == {
        "inventory_movements", "journal_entries", "partners", "transactions", "vouchers",
    }
    assert {"users", "accounts", "app_settings", "page_content"}.issubset({row["name"] for row in rows})


def test_clean_partners_removes_settings_and_linked_ledgers(client, login):
    login("superadmin")

    async def seed():
        from app.core.database import get_database

        db = get_database()
        await db.app_settings.update_one(
            {"_id": "global"},
            {"$set": {"partners": [{
                "partner_name": "Clean Test",
                "account_name": "Clean Test Capital",
                "account_code": "PAR-CLEAN",
                "share_percentage": 100,
                "opening_balance": 0,
                "admission_date": "2026-04-01",
                "retirement_date": None,
            }]}},
            upsert=True,
        )
        await db.accounts.insert_many([
            {"code": "PAR-CLEAN", "name": "Clean Test Capital", "type": "Equity", "group": "Capital", "opening_balance": 0, "is_active": True, "partner_capital": True},
            {"code": "PAR-CLEAN-LOAN", "name": "Clean Test Loan", "type": "Liability", "group": "Current Liabilities", "opening_balance": 0, "is_active": True, "partner_loan": True},
            {"code": "PAR-CLEAN-DRAW", "name": "Clean Test Drawings", "type": "Equity", "group": "Capital", "opening_balance": 0, "is_active": True, "partner_drawings": True},
        ])

    client.portal.call(seed)
    listed = client.get("/api/admin/collections")
    partner_row = next(row for row in listed.json() if row["name"] == "partners")
    assert partner_row["document_count"] == 4

    response = client.post("/api/admin/clean", json={
        "collections": ["partners"],
        "password": "password123",
    })
    assert response.status_code == 200
    assert response.json()["deleted"]["partners"] == 4

    async def verify():
        from app.core.database import get_database

        db = get_database()
        settings = await db.app_settings.find_one({"_id": "global"})
        assert settings["partners"] == []
        assert await db.accounts.count_documents({"name": {"$in": [
            "Clean Test Capital", "Clean Test Loan", "Clean Test Drawings",
        ]}}) == 0
        assert await db.accounts.count_documents({"name": "Cash"}) == 1

    client.portal.call(verify)


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

    async def seed_reference():
        from app.core.database import get_database
        await get_database().journal_entries.update_one(
            {"voucher_no": "SEC-ACCOUNT-REFERENCE"},
            {"$set": {
                "voucher_no": "SEC-ACCOUNT-REFERENCE",
                "date": "2026-07-20",
                "narration": "Security deletion reference",
                "status": "Posted",
                "entries": [
                    {"account": "Cash", "debit": 1, "credit": 0},
                    {"account": "Capital", "debit": 0, "credit": 1},
                ],
            }},
            upsert=True,
        )

    client.portal.call(seed_reference)
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


def test_clean_database_requires_current_superadmin_password(client, login):
    login("superadmin")
    missing = client.post("/api/admin/clean", json={"collections": ["vouchers"]})
    assert missing.status_code == 422
    wrong = client.post("/api/admin/clean", json={
        "collections": ["vouchers"],
        "password": "incorrect-password",
    })
    assert wrong.status_code == 403


def test_superadmin_can_create_only_seed_aligned_default_accounts(client, login):
    from app.default_accounts import ESSENTIAL_DEFAULT_ACCOUNTS

    saved_accounts = []

    async def remove_mapped_accounts():
        from app.core.database import get_database

        db = get_database()
        names = [account["name"] for account in ESSENTIAL_DEFAULT_ACCOUNTS]
        saved_accounts.extend(await db.accounts.find({"name": {"$in": names}}).to_list(length=None))
        await db.accounts.delete_many({"name": {"$in": names}})

    async def restore_mapped_accounts():
        from app.core.database import get_database

        db = get_database()
        names = [account["name"] for account in ESSENTIAL_DEFAULT_ACCOUNTS]
        await db.accounts.delete_many({"name": {"$in": names}})
        if saved_accounts:
            await db.accounts.insert_many(saved_accounts)

    client.portal.call(remove_mapped_accounts)
    try:
        login("superadmin")
        expected_count = len(ESSENTIAL_DEFAULT_ACCOUNTS)
        first = client.post("/api/admin/default-accounts")
        assert first.status_code == 201
        assert first.json() == {"created": expected_count, "existing": 0, "total": expected_count}

        rows = client.get("/api/accounts").json()
        mapped_rows = {row["name"]: row for row in rows if row["name"] in {
            account["name"] for account in ESSENTIAL_DEFAULT_ACCOUNTS
        }}
        assert set(mapped_rows) == {account["name"] for account in ESSENTIAL_DEFAULT_ACCOUNTS}
        for expected in ESSENTIAL_DEFAULT_ACCOUNTS:
            actual = mapped_rows[expected["name"]]
            assert {field: actual[field] for field in ("code", "name", "type", "group")} == expected
            assert actual["opening_balance"] == 0

        second = client.post("/api/admin/default-accounts")
        assert second.status_code == 201
        assert second.json() == {"created": 0, "existing": expected_count, "total": expected_count}
    finally:
        client.portal.call(restore_mapped_accounts)


def test_clean_database_default_mapping_matches_seed():
    from app.default_accounts import ESSENTIAL_DEFAULT_ACCOUNTS
    from scripts.seed import DEFAULT_ACCOUNTS

    seeded_by_name = {account["name"]: account for account in DEFAULT_ACCOUNTS}
    for expected in ESSENTIAL_DEFAULT_ACCOUNTS:
        seeded = seeded_by_name[expected["name"]]
        assert {field: seeded[field] for field in ("code", "name", "type", "group")} == expected
