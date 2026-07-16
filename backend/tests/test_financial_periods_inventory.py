from datetime import date

from app.financial_reports import get_financial_year


def test_indian_financial_year_boundaries():
    assert get_financial_year(date(2025, 4, 1)).start_date == date(2025, 4, 1)
    assert get_financial_year(date(2026, 3, 31)).end_date == date(2026, 3, 31)
    assert get_financial_year(date(2025, 3, 31)).start_date == date(2024, 4, 1)


def test_available_financial_years_come_from_journal_dates(client, login):
    login()

    async def seed():
        from app.core.database import get_database
        await get_database().journal_entries.update_one(
            {"voucher_no": "FY-DISCOVERY"},
            {"$set": {"voucher_no": "FY-DISCOVERY", "date": "2025-03-31", "narration": "FY discovery", "status": "Posted", "entries": [{"account": "Cash", "debit": 1, "credit": 0}, {"account": "Capital", "debit": 0, "credit": 1}]}},
            upsert=True,
        )

    client.portal.call(seed)
    response = client.get("/api/reports/financial-years")
    assert response.status_code == 200
    assert {row["start_date"] for row in response.json()["periods"]}.issuperset({"2024-04-01"})


def test_fifo_stock_and_period_report(client, login):
    login()

    async def seed():
        from app.core.database import get_database

        db = get_database()
        await db.inventory_movements.delete_many({"item_id": "FIFO-ITEM"})
        await db.journal_entries.delete_many({"voucher_no": {"$in": ["FY-PRIOR", "FY-SALE", "FY-NEXT"]}})
        await db.inventory_movements.insert_many([
            {"date": "2025-03-01", "item_id": "FIFO-ITEM", "quantity": 10, "rate": 100, "transaction_type": "INWARD"},
            {"date": "2025-04-02", "item_id": "FIFO-ITEM", "quantity": 5, "rate": 120, "transaction_type": "INWARD"},
            {"date": "2025-04-03", "item_id": "FIFO-ITEM", "quantity": 12, "rate": None, "transaction_type": "OUTWARD"},
        ])
        await db.journal_entries.insert_many([
            {"voucher_no": "FY-PRIOR", "date": "2025-03-31", "narration": "Prior cash", "status": "Posted", "entries": [{"account": "Cash", "debit": 50, "credit": 0}, {"account": "Capital", "debit": 0, "credit": 50}]},
            {"voucher_no": "FY-SALE", "date": "2025-04-01", "narration": "Sale", "status": "Posted", "entries": [{"account": "Cash", "debit": 200, "credit": 0}, {"account": "Sales", "debit": 0, "credit": 200}]},
            {"voucher_no": "FY-NEXT", "date": "2026-04-01", "narration": "Next FY", "status": "Posted", "entries": [{"account": "Cash", "debit": 999, "credit": 0}, {"account": "Sales", "debit": 0, "credit": 999}]},
        ])

    client.portal.call(seed)
    stock = client.get("/api/reports/stock-value?as_of_date=2025-04-03")
    assert stock.status_code == 200
    assert stock.json()["value"] == 360  # 3 units left from the second FIFO layer

    report = client.get("/api/reports/financial-statements?start_date=2025-04-01&end_date=2026-03-31")
    assert report.status_code == 200
    body = report.json()
    assert body["profit_and_loss"]["opening_stock"] == 1000
    assert body["profit_and_loss"]["closing_stock"] == 360
    assert next(r for r in body["trial_balance"]["rows"] if r["name"] == "Cash")["opening_balance"] == 1050
    assert next(r for r in body["trial_balance"]["rows"] if r["name"] == "Sales")["period_movement"] == 200
    assert all(row["code"] not in {"OPENING-STOCK", "OPENING-STOCK-RESERVE"} for row in body["trial_balance"]["rows"])
    assert next(r for r in body["balance_sheet"]["assets"] if r["name"] == "Stock-in-Hand")["calculated"] is True

    new_business = client.get("/api/reports/financial-statements?start_date=2025-04-01&end_date=2026-03-31&business_start_date=2025-06-01")
    assert new_business.json()["profit_and_loss"]["opening_stock"] == 0


def test_comparative_columns_use_independent_fy_periods(client, login):
    login()
    response = client.get("/api/reports/comparative-financial-statements?as_of=2025-07-01&as_of=2026-07-01")
    assert response.status_code == 200
    columns = response.json()["columns"]
    assert [column["period"] for column in columns] == [
        {"start_date": "2025-04-01", "end_date": "2026-03-31"},
        {"start_date": "2026-04-01", "end_date": "2027-03-31"},
    ]

    second_year_trial = columns[1]["trial_balance"]["rows"]
    assert all(row["code"] != "OPENING-RE" for row in second_year_trial)
    assert all(row["name"] != "Net Profit" for row in columns[1]["balance_sheet"]["liabilities_and_capital"])


def test_closing_stock_posts_profit_transfer_to_capital(client, login):
    login("admin")

    async def seed():
        from app.core.database import get_database
        db = get_database()
        await db.accounts.update_one(
            {"name": "Closing Stock"},
            {"$set": {"code": "CLOSE-STOCK", "name": "Closing Stock", "type": "Asset", "group": "Current Assets", "opening_balance": 0, "is_active": True}},
            upsert=True,
        )
        await db.accounts.update_one(
            {"name": "Purchases"},
            {"$set": {"code": "PURCHASES", "name": "Purchases", "type": "Expense", "group": "Direct Expenses", "opening_balance": 0, "is_active": True}},
            upsert=True,
        )
        await db.accounts.update_one(
            {"name": "Drawings"},
            {"$set": {"code": "DRAWINGS", "name": "Drawings", "type": "Equity", "group": "Capital", "opening_balance": 0, "is_active": True}},
            upsert=True,
        )
        await db.journal_entries.delete_many({"date": {"$gte": "2030-04-01", "$lte": "2031-03-31"}})

    client.portal.call(seed)
    sale = client.post("/api/journal-entries", json={
        "date": "2031-03-30", "voucher_no": "FY30-SALE", "narration": "Sale",
        "entries": [{"account": "Cash", "debit": 500, "credit": 0}, {"account": "Sales", "debit": 0, "credit": 500}],
    })
    assert sale.status_code == 201
    drawing = client.post("/api/journal-entries", json={
        "date": "2030-10-01", "voucher_no": "FY30-DRAWING", "narration": "Cash withdrawn by proprietor",
        "entries": [{"account": "Drawings", "debit": 100, "credit": 0}, {"account": "Cash", "debit": 0, "credit": 100}],
    })
    assert drawing.status_code == 201
    closing = client.post("/api/journal-entries", json={
        "date": "2031-03-31", "voucher_no": "FY30-STOCK", "narration": "Closing stock valued",
        "entries": [{"account": "Closing Stock", "debit": 200, "credit": 0}, {"account": "Purchases", "debit": 0, "credit": 200}],
    })
    assert closing.status_code == 201

    journals = client.get("/api/journal-entries").json()
    transfer = next(row for row in journals if row["voucher_no"] == "PROFIT-TRANSFER-2030-31")
    assert transfer["system_entry_type"] == "PROFIT_TRANSFER"
    assert transfer["entries"] == [
        {"account": "Profit & Loss Account", "debit": 700.0, "credit": 0.0},
        {"account": "Capital", "debit": 0.0, "credit": 700.0},
    ]
    drawings_transfer = next(row for row in journals if row["voucher_no"] == "DRAWINGS-TRANSFER-2030-31")
    assert drawings_transfer["date"] == "2031-03-31"
    assert drawings_transfer["entries"] == [
        {"account": "Capital", "debit": 100.0, "credit": 0.0},
        {"account": "Drawings", "debit": 0.0, "credit": 100.0},
    ]
    report = client.get("/api/reports/financial-statements?start_date=2030-04-01&end_date=2031-03-31").json()
    claims = report["balance_sheet"]["liabilities_and_capital"]
    assert all(row["name"] != "Profit & Loss Account" for row in claims)
    capital = next(row for row in report["trial_balance"]["rows"] if row["name"] == "Capital")
    assert capital["period_movement"] == -100.0
    assert next(row for row in claims if row["name"] == "Capital")["amount"] == capital["opening_balance"] + 600.0
    assert all(row["name"] != "Profit & Loss Account" for row in report["trial_balance"]["rows"])

    capital_ledger = client.get("/api/reports/ledger/Capital").json()
    assert any(row["voucher_no"] == "PROFIT-TRANSFER-2030-31" and row["credit"] == 700.0 for row in capital_ledger)

    next_year = client.get(
        "/api/reports/financial-statements?start_date=2031-04-01&end_date=2032-03-31"
    ).json()
    next_capital = next(row for row in next_year["trial_balance"]["rows"] if row["name"] == "Capital")
    assert next_capital["opening_balance"] == capital["opening_balance"] + 600.0
    assert all(row["name"] != "Profit & Loss Account" for row in next_year["trial_balance"]["rows"])


def test_trial_balance_omits_accounts_without_any_data(client, login):
    login()

    async def seed():
        from app.core.database import get_database
        await get_database().accounts.update_one(
            {"name": "Unused Trial Ledger"},
            {"$set": {"code": "UNUSED-TB", "name": "Unused Trial Ledger", "type": "Asset", "group": "Current Assets", "opening_balance": 0, "is_active": True}},
            upsert=True,
        )

    client.portal.call(seed)
    response = client.get("/api/reports/financial-statements?start_date=2025-04-01&end_date=2026-03-31")
    assert response.status_code == 200
    assert all(row["name"] != "Unused Trial Ledger" for row in response.json()["trial_balance"]["rows"])


def test_trial_balance_keeps_fully_settled_ledger(client, login):
    login()

    async def seed():
        from app.core.database import get_database
        db = get_database()
        await db.accounts.update_one(
            {"name": "Settled Customer"},
            {"$set": {"code": "SETTLED", "name": "Settled Customer", "type": "Asset", "group": "Sundry Debtors", "opening_balance": 0, "is_active": True}},
            upsert=True,
        )
        await db.journal_entries.delete_many({"voucher_no": {"$in": ["SETTLE-1", "SETTLE-2"]}})
        await db.journal_entries.insert_many([
            {"voucher_no": "SETTLE-1", "date": "2025-05-01", "narration": "Customer invoice", "status": "Posted", "entries": [{"account": "Settled Customer", "debit": 100, "credit": 0}, {"account": "Sales", "debit": 0, "credit": 100}]},
            {"voucher_no": "SETTLE-2", "date": "2025-05-02", "narration": "Customer receipt", "status": "Posted", "entries": [{"account": "Bank Account", "debit": 100, "credit": 0}, {"account": "Settled Customer", "debit": 0, "credit": 100}]},
        ])

    client.portal.call(seed)
    response = client.get("/api/reports/financial-statements?start_date=2025-04-01&end_date=2026-03-31")
    row = next(item for item in response.json()["trial_balance"]["rows"] if item["name"] == "Settled Customer")
    assert row["period_movement"] == 0
    assert row["closing_balance"] == 0

    body = response.json()
    assert any(item["name"] == "Settled Customer" and item["amount"] == 0 for item in body["balance_sheet"]["assets"])


def test_future_account_does_not_leak_into_earlier_reports(client, login):
    login()

    async def seed():
        from app.core.database import get_database
        db = get_database()
        await db.accounts.update_one(
            {"name": "Future Supplier Z"},
            {"$set": {"code": "FUTURE-Z", "name": "Future Supplier Z", "type": "Liability", "group": "Sundry Creditors", "opening_balance": 0, "is_active": True}},
            upsert=True,
        )
        await db.journal_entries.update_one(
            {"voucher_no": "FUTURE-Z-1"},
            {"$set": {"voucher_no": "FUTURE-Z-1", "date": "2026-05-01", "narration": "Future supplier purchase", "status": "Posted", "entries": [{"account": "Purchases", "debit": 50, "credit": 0}, {"account": "Future Supplier Z", "debit": 0, "credit": 50}]}},
            upsert=True,
        )

    client.portal.call(seed)
    response = client.get("/api/reports/financial-statements?start_date=2024-04-01&end_date=2025-03-31")
    body = response.json()
    names = {
        *(row["name"] for row in body["trial_balance"]["rows"]),
        *(row["name"] for row in body["profit_and_loss"]["direct_expenses"]),
        *(row["name"] for row in body["balance_sheet"]["liabilities_and_capital"]),
    }
    assert "Future Supplier Z" not in names
