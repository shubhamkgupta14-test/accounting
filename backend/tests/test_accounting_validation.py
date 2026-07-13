import math

import pytest
from pydantic import ValidationError

from app.schemas import JournalEntryCreate, TransactionCreate


def test_unbalanced_journal_is_rejected():
    with pytest.raises(ValidationError):
        JournalEntryCreate(
            date="2026-01-01", voucher_no="JV-X", narration="Unbalanced", status="Posted",
            entries=[{"account": "Cash", "debit": 100, "credit": 0}, {"account": "Sales", "debit": 0, "credit": 99}],
        )


@pytest.mark.parametrize("debit,credit", [(0, 0), (10, 10)])
def test_transaction_requires_exactly_one_side(debit, credit):
    with pytest.raises(ValidationError):
        TransactionCreate(book="cash", date="2026-01-01", particulars="Invalid", voucher_no="T-X", type="Receipt", debit=debit, credit=credit)


def test_non_finite_money_is_rejected():
    with pytest.raises(ValidationError):
        TransactionCreate(book="cash", date="2026-01-01", particulars="Invalid", voucher_no="T-X", type="Receipt", debit=math.inf, credit=0)


def test_draft_journal_does_not_change_balances_until_posted(client, login):
    login("admin")
    payload = {
        "date": "2026-01-02", "voucher_no": "JV-TEST-DRAFT", "narration": "Test sale", "status": "Draft",
        "entries": [{"account": "Cash", "debit": 200, "credit": 0}, {"account": "Sales", "debit": 0, "credit": 200}],
    }
    created = client.post("/api/journal-entries", json=payload)
    assert created.status_code == 201
    before = {row["name"]: row["balance"] for row in client.get("/api/accounts").json()}
    assert before["Cash"] == 1000
    assert before["Sales"] == 0
    assert client.patch(f"/api/journal-entries/{created.json()['id']}/post").status_code == 200
    after = {row["name"]: row["balance"] for row in client.get("/api/accounts").json()}
    assert after["Cash"] == 1200
    assert after["Sales"] == 200


def test_trial_balance_is_balanced(client, login):
    login("user")
    response = client.get("/api/reports/trial-balance")
    assert response.status_code == 200
    body = response.json()
    assert abs(body["total_debit"] - body["total_credit"]) < 0.005
