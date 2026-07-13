def test_content_is_public(client):
    response = client.get("/api/content")
    assert response.status_code == 200
    assert response.json()["pages"]["dashboard"]["title"]
    assert response.json()["footer"]


def test_admin_cannot_update_content(client, login):
    login("admin")
    response = client.post("/api/content", json=[
        {"page": "dashboard", "title": "Changed", "description": "Not allowed"},
    ])
    assert response.status_code == 403


def test_superadmin_can_update_many_pages_and_footer(client, login):
    login("superadmin")
    response = client.post("/api/content", json=[
        {"page": "dashboard", "title": "Overview", "description": "Live business overview"},
        {"page": "reports", "title": "Financial Reports", "description": "Review all reports"},
        {"page": "footer", "title": "", "description": "Custom accounting footer"},
    ])
    assert response.status_code == 200
    assert response.json() == {"updated": ["dashboard", "reports", "footer"], "count": 3}

    content = client.get("/api/content").json()
    assert content["pages"]["dashboard"] == {"title": "Overview", "description": "Live business overview"}
    assert content["pages"]["reports"]["title"] == "Financial Reports"
    assert content["footer"] == "Custom accounting footer"


def test_content_update_rejects_duplicate_or_unknown_pages(client, login):
    login("superadmin")
    duplicate = client.post("/api/content", json=[
        {"page": "dashboard", "title": "One", "description": "One"},
        {"page": "dashboard", "title": "Two", "description": "Two"},
    ])
    assert duplicate.status_code == 400
    unknown = client.post("/api/content", json=[
        {"page": "not-a-page", "title": "No", "description": "No"},
    ])
    assert unknown.status_code == 400
