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
    assert client.post("/api/auth/login", json=payload).status_code == 429


def test_untrusted_origin_is_rejected(client):
    response = client.post(
        "/api/auth/login", headers={"Origin": "https://evil.example"},
        json={"email": "user@example.com", "password": "password123"},
    )
    assert response.status_code == 403


def test_local_development_origin_on_another_port_is_allowed(client):
    response = client.post(
        "/api/auth/login", headers={"Origin": "http://localhost:8443"},
        json={"email": "user@example.com", "password": "password123"},
    )
    assert response.status_code == 200


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


def test_invalid_transaction_book_is_rejected(client, login):
    login("user")
    assert client.get("/api/transactions?book=crypto").status_code == 422
