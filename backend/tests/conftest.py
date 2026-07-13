import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))
os.environ["MONGODB_DB"] = "accounting_test"
os.environ["ENV"] = "test"

from app.core.security import hash_password
from app.main import app


USERS = [
    ("super@example.com", "superadmin"),
    ("admin@example.com", "admin"),
    ("user@example.com", "user"),
    ("otp@example.com", "user"),
]
PASSWORD = "password123"


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        async def seed():
            from app.core.database import get_database
            db = get_database()
            await db.client.drop_database(db.name)
            now = datetime.now(timezone.utc)
            await db.users.insert_many([
                {"first_name": role.title(), "last_name": "Tester", "email": email, "role": role,
                 "password_hash": hash_password(PASSWORD), "token_version": 0, "is_active": True, "created_at": now}
                for email, role in USERS
            ])
            await db.accounts.insert_many([
                {"code": "CASH", "name": "Cash", "type": "Asset", "group": "Current Assets", "opening_balance": 1000, "is_active": True},
                {"code": "BANK", "name": "Bank Account", "type": "Asset", "group": "Bank", "opening_balance": 500, "is_active": True},
                {"code": "SALES", "name": "Sales", "type": "Income", "group": "Direct Income", "opening_balance": 0, "is_active": True},
                {"code": "CAP", "name": "Capital", "type": "Equity", "group": "Capital", "opening_balance": 1500, "is_active": True},
            ])
        test_client.portal.call(seed)
        yield test_client
        async def cleanup():
            from app.core.database import get_database
            db = get_database()
            await db.client.drop_database(db.name)
        test_client.portal.call(cleanup)


@pytest.fixture(autouse=True)
def reset_client_session(client):
    client.cookies.clear()
    yield
    client.cookies.clear()


@pytest.fixture
def login(client):
    def perform(role="user"):
        email = next(email for email, user_role in USERS if user_role == role)
        response = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
        assert response.status_code == 200
        return response
    return perform
