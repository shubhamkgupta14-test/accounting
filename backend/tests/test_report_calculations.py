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
            {
                "voucher_no": "LEDGER-DRAFT", "date": "2026-08-03", "narration": "Draft entry",
                "status": "Draft", "entries": [
                    {"account": "Draft Only Account", "debit": 50, "credit": 0},
                    {"account": "Sales", "debit": 0, "credit": 50},
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
    account_names = client.get("/api/reports/ledger-accounts")
    assert account_names.status_code == 200
    assert "Ledger Test Asset" in account_names.json()["accounts"]
    assert "Draft Only Account" not in account_names.json()["accounts"]


def test_dashboard_chart_matches_net_profit_analysis_rules(client, login):
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
    assert september["expenses"] == -10
    assert september["revenue"] >= 0
    assert september["profit"] == september["revenue"] - september["expenses"]


def test_dashboard_sales_and_purchases_are_net_of_reversals(client, login):
    login()

    async def seed():
        from app.core.database import get_database
        db = get_database()
        await db.journal_entries.delete_many({"voucher_no": {"$in": ["DASH-NET-SALES", "DASH-NET-PURCHASES"]}})
        await db.journal_entries.insert_many([
            {"voucher_no": "DASH-NET-SALES", "date": "2026-10-01", "narration": "Sales reversal", "status": "Posted", "entries": [{"account": "Sales", "debit": 30, "credit": 0}, {"account": "Cash", "debit": 0, "credit": 30}]},
            {"voucher_no": "DASH-NET-PURCHASES", "date": "2026-10-02", "narration": "Purchase adjustment", "status": "Posted", "entries": [{"account": "Cash", "debit": 30, "credit": 0}, {"account": "Purchases", "debit": 0, "credit": 30}]},
        ])

    before = client.get("/api/reports/dashboard").json()["stats"]
    client.portal.call(seed)
    after = client.get("/api/reports/dashboard").json()["stats"]
    assert after["sales"] == before["sales"] - 30
    assert after["purchases"] == before["purchases"] - 30


def test_dashboard_excludes_opening_stock_reversal_from_purchases(client, login):
    login()

    async def seed():
        from app.core.database import get_database
        db = get_database()
        await db.accounts.update_one(
            {"name": "Stock-in-Hand"},
            {"$set": {"code": "STOCK-TEST", "name": "Stock-in-Hand", "type": "Asset", "group": "Current Assets", "opening_balance": 0, "is_active": True}},
            upsert=True,
        )
        await db.journal_entries.delete_many({"voucher_no": "DASH-OPENING-STOCK"})
        await db.journal_entries.insert_one({
            "voucher_no": "DASH-OPENING-STOCK", "date": "2026-04-01", "narration": "Opening stock brought forward", "status": "Posted",
            "entries": [{"account": "Purchases", "debit": 80, "credit": 0}, {"account": "Stock-in-Hand", "debit": 0, "credit": 80}],
        })

    before = client.get("/api/reports/dashboard").json()
    client.portal.call(seed)
    after = client.get("/api/reports/dashboard").json()
    assert after["stats"]["purchases"] == before["stats"]["purchases"]
    april_before = next((row["expenses"] for row in before["monthly"] if row["key"] == "2026-04"), 0)
    april_after = next((row["expenses"] for row in after["monthly"] if row["key"] == "2026-04"), 0)
    assert april_after == april_before


def test_filtered_dashboard_profit_uses_closing_stock(client, login):
    login()

    async def seed():
        from app.core.database import get_database
        db = get_database()
        await db.accounts.update_one(
            {"name": "Purchases"},
            {"$set": {"code": "PUR-DASH", "name": "Purchases", "type": "Expense", "group": "Direct Expenses", "opening_balance": 0, "is_active": True}},
            upsert=True,
        )
        await db.accounts.update_one(
            {"name": "Rent Expense"},
            {"$set": {"code": "RENT-DASH", "name": "Rent Expense", "type": "Expense", "group": "Indirect Expenses", "opening_balance": 0, "is_active": True}},
            upsert=True,
        )
        await db.accounts.update_one(
            {"name": "Inventory / Stock"},
            {"$set": {"code": "INV-DASH", "name": "Inventory / Stock", "type": "Asset", "group": "Current Assets", "opening_balance": 0, "is_active": True}},
            upsert=True,
        )
        await db.journal_entries.delete_many({"voucher_no": {"$in": ["DASH-FY-PUR", "DASH-FY-SALE", "DASH-FY-RENT", "DASH-FY-STOCK"]}})
        await db.journal_entries.insert_many([
            {"voucher_no": "DASH-FY-PUR", "date": "2024-05-01", "narration": "Purchase", "status": "Posted", "entries": [{"account": "Purchases", "debit": 20, "credit": 0}, {"account": "Cash", "debit": 0, "credit": 20}]},
            {"voucher_no": "DASH-FY-SALE", "date": "2024-06-01", "narration": "Sale", "status": "Posted", "entries": [{"account": "Cash", "debit": 21, "credit": 0}, {"account": "Sales", "debit": 0, "credit": 21}]},
            {"voucher_no": "DASH-FY-RENT", "date": "2024-07-01", "narration": "Rent", "status": "Posted", "entries": [{"account": "Rent Expense", "debit": 5, "credit": 0}, {"account": "Cash", "debit": 0, "credit": 5}]},
            {"voucher_no": "DASH-FY-STOCK", "date": "2025-03-31", "narration": "Closing stock valued", "status": "Posted", "entries": [{"account": "Inventory / Stock", "debit": 8, "credit": 0}, {"account": "Purchases", "debit": 0, "credit": 8}]},
        ])

    client.portal.call(seed)
    result = client.get("/api/reports/dashboard?graph_start_date=2024-04-01&graph_end_date=2025-03-31").json()["stats"]
    assert result["profit"] >= 4


def test_financial_report_journal_data_contains_all_saved_entries(client, login):
    login()

    async def seed():
        from app.core.database import get_database

        db = get_database()
        await db.journal_entries.delete_many({"voucher_no": {"$in": ["REPORT-DATA-POSTED", "REPORT-DATA-DRAFT"]}})
        entries = [{"account": "Cash", "debit": 10, "credit": 0}, {"account": "Capital", "debit": 0, "credit": 10}]
        await db.journal_entries.insert_many([
            {"voucher_no": "REPORT-DATA-POSTED", "date": "2027-03-30", "narration": "Posted report row", "status": "Posted", "entries": entries},
            {"voucher_no": "REPORT-DATA-DRAFT", "date": "2027-03-31", "narration": "Draft report row", "status": "Draft", "entries": entries},
        ])

    client.portal.call(seed)
    response = client.get("/api/reports/journal-data")

    assert response.status_code == 200
    voucher_numbers = {row["voucher_no"] for row in response.json()}
    assert "REPORT-DATA-POSTED" in voucher_numbers
    assert "REPORT-DATA-DRAFT" in voucher_numbers


def test_comparative_report_limits_number_of_periods(client, login):
    from app.core.config import settings

    login()
    query = "&".join(
        f"as_of={2020 + index}-04-01"
        for index in range(settings.max_comparative_periods + 1)
    )
    response = client.get(f"/api/reports/comparative-financial-statements?{query}")
    assert response.status_code == 422
