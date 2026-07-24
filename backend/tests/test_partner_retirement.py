import pytest


PARTNERS = [
    {"partner_name": "Retirement Test Partner", "account_name": "Retirement Test Partner Capital", "account_code": "PAR-CA-99", "share_percentage": 60, "opening_balance": 1000, "admission_date": "2040-04-01", "retirement_date": None, "retirement_share_percentage": None},
    {"partner_name": "Continuing Test Partner", "account_name": "Continuing Test Partner Capital", "account_code": "PAR-CA-98", "share_percentage": 40, "opening_balance": 500, "admission_date": "2040-04-01", "retirement_date": None, "retirement_share_percentage": None},
]

PAYLOAD = {
    "partner_name": "Retirement Test Partner", "account_name": "Retirement Test Partner Capital",
    "account_code": "PAR-CA-99", "share_percentage": 60,
    "admission_date": "2040-04-01", "retirement_date": "2040-04-02",
    "profit_partners": [
        {"account_name": "Retirement Test Partner Capital", "share_percentage": 60},
        {"account_name": "Continuing Test Partner Capital", "share_percentage": 40},
    ],
}


@pytest.fixture
def retirement_setup(client):
    saved_partners = []

    async def seed():
        from app.core.database import get_database

        db = get_database()
        settings = await db.app_settings.find_one({"_id": "global"}) or {}
        saved_partners.extend(settings.get("partners", []))
        names = [
            "Retirement Test Partner Capital", "Continuing Test Partner Capital",
            "Retirement Test Partner Loan", "Retirement Test Revenue", "Retirement Test Clearing",
        ]
        await db.journal_entries.delete_many({"date": {"$gte": "2040-04-01", "$lte": "2041-03-31"}})
        await db.accounts.delete_many({"name": {"$in": names}})
        await db.accounts.insert_many([
            {"code": "PAR-CA-99", "name": "Retirement Test Partner Capital", "type": "Equity", "group": "Capital", "opening_balance": 1000, "is_active": True, "partner_capital": True},
            {"code": "PAR-CA-98", "name": "Continuing Test Partner Capital", "type": "Equity", "group": "Capital", "opening_balance": 500, "is_active": True, "partner_capital": True},
            {"code": "RET-REV", "name": "Retirement Test Revenue", "type": "Income", "group": "Direct Income", "opening_balance": 0, "is_active": True},
            {"code": "RET-CLEAR", "name": "Retirement Test Clearing", "type": "Asset", "group": "Current Assets", "opening_balance": 0, "is_active": True},
        ])
        await db.journal_entries.insert_one({
            "voucher_no": "RETIREMENT-TEST-PROFIT", "date": "2040-04-02",
            "narration": "Retirement test profit", "status": "Posted",
            "entries": [
                {"account": "Retirement Test Clearing", "debit": 100, "credit": 0},
                {"account": "Retirement Test Revenue", "debit": 0, "credit": 100},
            ],
        })
        await db.app_settings.update_one({"_id": "global"}, {"$set": {"partners": PARTNERS}}, upsert=True)

    async def cleanup():
        from app.core.database import get_database

        db = get_database()
        await db.journal_entries.delete_many({"date": {"$gte": "2040-04-01", "$lte": "2041-03-31"}})
        await db.accounts.delete_many({"name": {"$in": [
            "Retirement Test Partner Capital", "Continuing Test Partner Capital",
            "Retirement Test Partner Loan", "Retirement Test Revenue", "Retirement Test Clearing",
        ]}})
        await db.app_settings.update_one({"_id": "global"}, {"$set": {"partners": saved_partners}}, upsert=True)

    client.portal.call(seed)
    yield
    client.portal.call(cleanup)


def test_retirement_allocates_profit_then_transfers_total_capital_to_loan(client, login, retirement_setup):
    login("superadmin")
    preview = client.post("/api/settings/partners/retirement-preview", json=PAYLOAD)
    assert preview.status_code == 200
    preview_entries = preview.json()["entries"]
    assert [row["system_entry_type"] for row in preview_entries] == [
        "RETIREMENT_PROFIT_TRANSFER", "RETIREMENT_CAPITAL_TO_LOAN",
    ]
    profit_entry, loan_entry = preview_entries
    assert profit_entry["entries"] == [
        {"account": "Profit & Loss Account", "debit": 100.0, "credit": 0.0},
        {"account": "Retirement Test Partner Capital", "debit": 0.0, "credit": 60.0},
        {"account": "Continuing Test Partner Capital", "debit": 0.0, "credit": 40.0},
    ]
    assert loan_entry["entries"] == [
        {"account": "Retirement Test Partner Capital", "debit": 1060.0, "credit": 0.0},
        {"account": "Retirement Test Partner Loan", "debit": 0.0, "credit": 1060.0},
    ]

    response = client.post("/api/settings/partners/retirement-confirm", json=PAYLOAD)
    assert response.status_code == 200
    settings = client.get("/api/settings").json()
    retiring, continuing = settings["partners"]
    assert retiring["retirement_date"] == "2040-04-02"
    assert retiring["retirement_share_percentage"] == 60
    assert retiring["share_percentage"] == 0
    assert continuing["share_percentage"] == 100
    accounts = {row["name"]: row for row in client.get("/api/accounts").json()}
    assert accounts["Retirement Test Partner Capital"]["balance"] == 0
    assert accounts["Retirement Test Partner Loan"]["balance"] == 1060


def test_clearing_retirement_date_reactivates_partner_and_reverses_settlement(client, login, retirement_setup):
    login("superadmin")
    assert client.post("/api/settings/partners/retirement-confirm", json=PAYLOAD).status_code == 200
    response = client.patch("/api/settings/partners/retirement-date", json={
        "account_name": "Retirement Test Partner Capital", "retirement_date": None,
    })
    assert response.status_code == 200
    assert response.json()["reactivated"] is True
    retiring, continuing = client.get("/api/settings").json()["partners"]
    assert retiring["retirement_date"] is None
    assert retiring["share_percentage"] == 60
    assert continuing["share_percentage"] == 40

    async def verify():
        from app.core.database import get_database

        db = get_database()
        assert await db.accounts.find_one({"name": "Retirement Test Partner Loan"}) is None
        assert await db.journal_entries.count_documents({"retirement_partner_account": "Retirement Test Partner Capital"}) == 0

    client.portal.call(verify)


def test_last_active_partner_cannot_be_retired(client, login, retirement_setup):
    login("superadmin")
    payload = {
        **PAYLOAD,
        "profit_partners": [{"account_name": "Retirement Test Partner Capital", "share_percentage": 100}],
        "share_percentage": 100,
    }
    response = client.post("/api/settings/partners/retirement-preview", json=payload)
    assert response.status_code == 422
    assert "last active partner" in response.text.lower()


def test_partner_settings_require_one_active_partner(client, login, retirement_setup):
    login("superadmin")
    retired = [{
        **partner, "share_percentage": 0, "retirement_date": "2040-04-02",
        "retirement_share_percentage": partner["share_percentage"],
    } for partner in PARTNERS]
    response = client.patch("/api/settings/partners", json={"partners": retired})
    assert response.status_code == 422
    assert "at least one active partner" in response.text.lower()
