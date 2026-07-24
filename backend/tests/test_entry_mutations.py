import pytest


@pytest.mark.parametrize("role", ["admin", "superadmin"])
def test_admin_roles_can_edit_and_delete_journals(client, login, role):
    login(role)
    voucher_no = f"EDIT-{role.upper()}-J"
    payload = {
        "date": "2026-07-13",
        "voucher_no": voucher_no,
        "narration": "Original journal narration",
        "status": "Posted",
        "entries": [
            {"account": "Cash", "debit": 100, "credit": 0},
            {"account": "Bank Account", "debit": 0, "credit": 100},
        ],
    }
    created = client.post("/api/journal-entries", json=payload)
    assert created.status_code == 201
    entry_id = created.json()["id"]

    payload["narration"] = "Updated journal narration"
    updated = client.put(f"/api/journal-entries/{entry_id}", json=payload)
    assert updated.status_code == 200
    assert updated.json()["narration"] == "Updated journal narration"
    assert updated.json()["status"] == "Posted"

    assert client.delete(f"/api/journal-entries/{entry_id}").status_code == 204


@pytest.mark.parametrize("role", ["admin", "superadmin"])
def test_admin_roles_can_edit_and_delete_vouchers_without_losing_approval(client, login, role):
    login(role)
    voucher_no = f"EDIT-{role.upper()}-V"
    payload = {
        "date": "2026-07-13",
        "voucher_no": voucher_no,
        "type": "Payment",
        "party": "Cash",
        "amount": 100,
        "mode": "Cash",
        "narration": "Original voucher narration",
    }
    created = client.post("/api/vouchers", json=payload)
    assert created.status_code == 201
    voucher_id = created.json()["id"]
    assert client.patch(f"/api/vouchers/{voucher_id}/approve").status_code == 200

    payload["narration"] = "Updated voucher narration"
    updated = client.put(f"/api/vouchers/{voucher_id}", json=payload)
    assert updated.status_code == 200
    assert updated.json()["narration"] == "Updated voucher narration"
    assert updated.json()["status"] == "Approved"

    assert client.delete(f"/api/vouchers/{voucher_id}").status_code == 204


def test_user_cannot_edit_or_delete_journals_and_vouchers(client, login):
    login("user")
    object_id = "507f1f77bcf86cd799439011"
    journal = {
        "date": "2026-07-13",
        "voucher_no": "NOT-ALLOWED-J",
        "narration": "Not allowed",
        "status": "Draft",
        "entries": [
            {"account": "Cash", "debit": 100, "credit": 0},
            {"account": "Bank Account", "debit": 0, "credit": 100},
        ],
    }
    voucher = {
        "date": "2026-07-13",
        "voucher_no": "NOT-ALLOWED-V",
        "type": "Payment",
        "party": "Cash",
        "amount": 100,
        "mode": "Cash",
        "narration": "Not allowed",
    }
    assert client.put(f"/api/journal-entries/{object_id}", json=journal).status_code == 403
    assert client.delete(f"/api/journal-entries/{object_id}").status_code == 403
    assert client.put(f"/api/vouchers/{object_id}", json=voucher).status_code == 403
    assert client.delete(f"/api/vouchers/{object_id}").status_code == 403


def test_admin_cannot_modify_records_created_by_another_user(client, login):
    journal = {
        "date": "2026-07-14",
        "voucher_no": "OWNER-SUPER-J",
        "narration": "Superadmin-owned journal",
        "status": "Posted",
        "entries": [
            {"account": "Cash", "debit": 75, "credit": 0},
            {"account": "Bank Account", "debit": 0, "credit": 75},
        ],
    }
    voucher = {
        "date": "2026-07-14",
        "voucher_no": "OWNER-SUPER-V",
        "type": "Payment",
        "party": "Cash",
        "amount": 75,
        "mode": "Cash",
        "narration": "Superadmin-owned voucher",
    }
    account = {
        "code": "OWNER-SUPER-A",
        "name": "Superadmin Owned Account",
        "type": "Expense",
        "group": "Test",
        "opening_balance": 0,
        "is_active": True,
    }

    login("superadmin")
    journal_id = client.post("/api/journal-entries", json=journal).json()["id"]
    voucher_id = client.post("/api/vouchers", json=voucher).json()["id"]
    account_id = client.post("/api/accounts", json=account).json()["id"]

    login("admin")
    journal["narration"] = "Admin attempted update"
    voucher["narration"] = "Admin attempted update"
    assert client.put(f"/api/journal-entries/{journal_id}", json=journal).status_code == 403
    assert client.delete(f"/api/journal-entries/{journal_id}").status_code == 403
    assert client.put(f"/api/vouchers/{voucher_id}", json=voucher).status_code == 403
    assert client.patch(f"/api/vouchers/{voucher_id}/approve").status_code == 403
    assert client.delete(f"/api/vouchers/{voucher_id}").status_code == 403
    assert client.patch(f"/api/accounts/{account_id}", json={"name": "Admin Attempt"}).status_code == 403
    assert client.delete(f"/api/accounts/{account_id}").status_code == 403

    login("superadmin")
    assert client.delete(f"/api/journal-entries/{journal_id}").status_code == 204
    assert client.delete(f"/api/vouchers/{voucher_id}").status_code == 204
    assert client.delete(f"/api/accounts/{account_id}").status_code == 204


def test_admin_can_update_and_delete_own_ledger_account(client, login):
    login("admin")
    created = client.post("/api/accounts", json={
        "code": "OWNER-ADMIN-A",
        "name": "Admin Owned Account",
        "type": "Expense",
        "group": "Test",
        "opening_balance": 0,
        "is_active": True,
    })
    assert created.status_code == 201
    assert created.json()["created_by"]
    account_id = created.json()["id"]
    assert client.patch(
        f"/api/accounts/{account_id}",
        json={"name": "Admin Owned Account Updated"},
    ).status_code == 200
    assert client.delete(f"/api/accounts/{account_id}").status_code == 204
