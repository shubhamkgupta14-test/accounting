def test_ledger_page_one_and_running_balance(client, login):
    login()

    async def seed():
        from app.core.database import get_database

        db = get_database()
        await db.accounts.update_one(
            {"name": "Ledger Test Asset"},
            {"$set": {"code": "LEDGERTEST", "name": "Ledger Test Asset", "type": "Asset", "group": "Current Assets", "opening_balance": 1000, "is_active": True}},
            upsert=True,
        )
        await db.journal_entries.delete_many({"voucher_no": {"$in": ["LEDGER-1", "LEDGER-2"]}})
        await db.journal_entries.insert_many([
            {
                "voucher_no": "LEDGER-1", "date": "2026-08-01", "narration": "Cash received",
                "status": "Posted", "entries": [
                    {"account": "Ledger Test Asset", "debit": 100, "credit": 0},
                    {"account": "Sales", "debit": 0, "credit": 100},
                ],
            },
            {
                "voucher_no": "LEDGER-2", "date": "2026-08-02", "narration": "Cash paid",
                "status": "Posted", "entries": [
                    {"account": "Ledger Test Asset", "debit": 0, "credit": 25},
                    {"account": "Capital", "debit": 25, "credit": 0},
                ],
            },
        ])

    client.portal.call(seed)
    first = client.get("/api/reports/ledger/Ledger%20Test%20Asset/page?page=1&page_size=1")
    second = client.get("/api/reports/ledger/Ledger%20Test%20Asset/page?page=2&page_size=1")

    assert first.status_code == 200
    assert first.json()["total"] == 2
    assert first.json()["items"][0]["balance"] == 1100
    assert second.status_code == 200
    assert second.json()["items"][0]["balance"] == 1075


def test_dashboard_chart_uses_positive_activity(client, login):
    login()

    async def seed():
        from app.core.database import get_database

        db = get_database()
        await db.accounts.update_one(
            {"name": "Test Expense"},
            {"$set": {"code": "TESTEXP", "name": "Test Expense", "type": "Expense", "group": "Indirect Expenses", "opening_balance": 0, "is_active": True}},
            upsert=True,
        )
        await db.journal_entries.delete_many({"voucher_no": "DASH-SIGN"})
        await db.journal_entries.insert_one({
            "voucher_no": "DASH-SIGN", "date": "2026-09-01", "narration": "Expense reversal",
            "status": "Posted", "entries": [
                {"account": "Test Expense", "debit": 10, "credit": 20},
                {"account": "Capital", "debit": 10, "credit": 0},
            ],
        })

    client.portal.call(seed)
    response = client.get("/api/reports/dashboard")

    assert response.status_code == 200
    september = next(row for row in response.json()["monthly"] if row["key"] == "2026-09")
    assert september["expenses"] == 10
    assert september["sales"] >= 0
