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
