def test_otp_can_only_be_used_once(client):
    requested = client.post("/api/auth/forgot-password", json={"email": "otp@example.com"})
    assert requested.status_code == 200
    otp = requested.json()["otp"]
    payload = {"email": "otp@example.com", "otp": otp, "new_password": "newpassword123"}
    assert client.post("/api/auth/reset-password", json=payload).status_code == 200
    assert client.post("/api/auth/reset-password", json=payload).status_code == 400


def test_short_reset_password_is_rejected(client):
    response = client.post("/api/auth/reset-password", json={"email": "user@example.com", "otp": "123456", "new_password": "short"})
    assert response.status_code == 422


def test_stage_never_returns_otp_or_html(client, monkeypatch):
    from app.core.config import settings
    from app.routes import auth

    monkeypatch.setattr(settings, "env", "stage")
    monkeypatch.setattr(auth, "send_html_email", lambda *_args, **_kwargs: True)
    response = client.post("/api/auth/forgot-password", json={"email": "user@example.com"})
    assert response.status_code == 200
    assert "otp" not in response.json()
    assert "html" not in response.json()


def test_forgot_password_cooldown_does_not_enumerate_accounts(client):
    existing = client.post("/api/auth/forgot-password", json={"email": "user@example.com"})
    missing = client.post("/api/auth/forgot-password", json={"email": "not-present@example.com"})
    assert existing.status_code == missing.status_code == 200
    assert existing.json() == missing.json()


def test_reset_password_has_account_and_ip_rate_limits(client):
    payload = {
        "email": "missing-reset-rate@example.com",
        "otp": "123456",
        "new_password": "newpassword123",
    }
    for _ in range(10):
        assert client.post("/api/auth/reset-password", json=payload).status_code == 400
    limited = client.post("/api/auth/reset-password", json=payload)
    assert limited.status_code == 429
    assert int(limited.headers["retry-after"]) > 0
