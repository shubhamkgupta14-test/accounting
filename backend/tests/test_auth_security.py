from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.core.config import settings
from app.core.security import ALGORITHM
from app.main import validate_security_configuration


def test_protected_route_requires_cookie(client):
    response = client.get("/api/accounts")
    assert response.status_code == 401


def test_login_sets_hardened_cookie(client):
    response = client.post(
        "/api/auth/login", json={"email": "user@example.com", "password": "password123"})
    cookie = response.headers["set-cookie"].lower()
    assert response.status_code == 200
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    assert "access_token" not in response.json()


def test_invalid_login_is_generic(client):
    response = client.post(
        "/api/auth/login", json={"email": "missing@example.com", "password": "wrong-password"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_repeated_failed_logins_are_rate_limited(client):
    payload = {"email": "rate-limit@example.com", "password": "wrong-password"}
    for _ in range(5):
        assert client.post("/api/auth/login", json=payload).status_code == 401
    limited = client.post("/api/auth/login", json=payload)
    assert limited.status_code == 429
    assert int(limited.headers["retry-after"]) > 0


def test_untrusted_origin_is_rejected(client):
    response = client.post(
        "/api/auth/login", headers={"Origin": "https://evil.example"},
        json={"email": "user@example.com", "password": "password123"},
    )
    assert response.status_code == 403


def test_configured_local_development_origin_is_allowed(client):
    origin = settings.cors_origin_list[0]
    response = client.post(
        "/api/auth/login", headers={"Origin": origin},
        json={"email": "user@example.com", "password": "password123"},
    )
    assert response.status_code == 200


def test_unconfigured_localhost_origin_is_rejected(client):
    response = client.post(
        "/api/auth/login", headers={"Origin": "http://localhost:3333"},
        json={"email": "user@example.com", "password": "password123"},
    )
    assert response.status_code == 403


def test_logout_revokes_session(client, login):
    login("user")
    assert client.get("/api/accounts").status_code == 200
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/accounts").status_code == 401


def test_oauth2_token_authenticates_swagger_and_api_clients(client):
    response = client.post("/api/auth/token", data={
        "username": "admin@example.com", "password": "password123",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    client.cookies.clear()
    response = client.get(
        "/api/accounts", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert response.status_code == 200


def test_invalid_bearer_token_returns_authentication_challenge(client):
    client.cookies.clear()
    response = client.get(
        "/api/accounts", headers={"Authorization": "Bearer invalid-token"})
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_malformed_object_id_returns_404(client, login):
    login("admin")
    assert client.patch(
        "/api/vouchers/not-an-object-id/approve").status_code == 404


def test_security_headers_and_private_cache(client, login):
    login("user")
    response = client.get("/api/accounts")
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["content-security-policy"].startswith("default-src 'none'")
    assert response.headers["cross-origin-opener-policy"] == "same-origin"


def test_invalid_transaction_book_is_rejected(client, login):
    login("user")
    assert client.get("/api/transactions?book=crypto").status_code == 422


def test_status_change_permanently_revokes_older_tokens(client, login):
    token_response = client.post("/api/auth/token", data={
        "username": "otp@example.com",
        "password": "password123",
    })
    token = token_response.json()["access_token"]
    client.cookies.clear()
    login("superadmin")
    users = client.get("/api/auth/users").json()
    target = next(user for user in users if user["email"] == "otp@example.com")
    assert client.patch(f"/api/auth/users/{target['id']}/status?is_active=false").status_code == 200
    assert client.patch(f"/api/auth/users/{target['id']}/status?is_active=true").status_code == 200
    client.cookies.clear()
    response = client.get("/api/accounts", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_jwt_requires_issuer_and_audience(client):
    now = datetime.now(timezone.utc)
    token = jwt.encode({
        "sub": "507f1f77bcf86cd799439011",
        "role": "user",
        "ver": 0,
        "iat": now,
        "exp": now + timedelta(minutes=5),
        "jti": "security-test",
    }, settings.jwt_secret, algorithm=ALGORITHM)
    response = client.get("/api/accounts", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_oversized_request_is_rejected_before_parsing(client):
    response = client.post(
        "/api/auth/login",
        headers={"Content-Length": str(settings.max_json_body_bytes + 1)},
        content=b"{}",
    )
    assert response.status_code == 413


def test_stage_requires_secure_cookies(monkeypatch):
    monkeypatch.setattr(settings, "env", "stage")
    monkeypatch.setattr(settings, "cookie_secure", False)
    with pytest.raises(RuntimeError, match="COOKIE_SECURE"):
        validate_security_configuration()


def test_secure_environment_adds_hsts(client, login, monkeypatch):
    login("user")
    monkeypatch.setattr(settings, "env", "stage")
    response = client.get("/api/accounts")
    assert response.headers["strict-transport-security"].startswith("max-age=31536000")
