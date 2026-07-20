def test_confirming_partner_retirement_creates_loan_account(client, login):
    login("superadmin")
    payload = {
        "partner_name": "Retirement Test Partner",
        "account_name": "Retirement Test Partner Capital",
        "account_code": "PAR-CA-99",
        "share_percentage": 100,
        "admission_date": "2026-04-01",
        "retirement_date": "2026-04-02",
        "profit_partners": [
            {"account_name": "Retirement Test Partner Capital", "share_percentage": 100},
        ],
    }

    response = client.post("/api/settings/partners/retirement-confirm", json=payload)

    assert response.status_code == 200
    assert response.json()["loan_account"] == {
        "name": "Retirement Test Partner Loan",
        "code": "PAR-CA-99-LOAN",
        "type": "Liability",
        "group": "Current Liabilities",
    }

    async def verify_and_cleanup():
        from app.core.database import get_database

        db = get_database()
        account = await db.accounts.find_one({"name": "Retirement Test Partner Loan"})
        assert account["type"] == "Liability"
        assert account["group"] == "Current Liabilities"
        assert account["opening_balance"] == 0
        await db.accounts.delete_one({"name": "Retirement Test Partner Loan"})
        await db.journal_entries.delete_many({"retirement_partner_account": payload["account_name"]})

    client.portal.call(verify_and_cleanup)
