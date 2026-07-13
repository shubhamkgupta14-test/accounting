def test_accounts_page_has_metadata_and_filters(client, login):
    login("user")
    response = client.get("/api/accounts/page?page=1&page_size=2&account_type=Asset&sort_by=name&sort_order=asc")
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"items", "page", "page_size", "total", "pages"}
    assert body["page"] == 1
    assert body["page_size"] == 2
    assert len(body["items"]) <= 2
    assert all(item["type"] == "Asset" for item in body["items"])
    assert all("balance" in item for item in body["items"])


def test_journal_page_search_status_and_sort_are_server_side(client, login):
    login("admin")
    response = client.get("/api/journal-entries/page?page=1&page_size=10&status=Posted&search=Test&sort_by=date&sort_order=desc")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= len(body["items"])
    assert all(item["status"] == "Posted" for item in body["items"])
    assert all("test" in (item["voucher_no"] + item["narration"]).lower() for item in body["items"])


def test_pagination_limits_and_sort_whitelists_are_validated(client, login):
    login("user")
    assert client.get("/api/accounts/page?page_size=101").status_code == 422
    assert client.get("/api/accounts/page?sort_by=created_by").status_code == 422
    assert client.get("/api/journal-entries/page?page=0").status_code == 422


def test_voucher_and_transaction_pages_return_bounded_results(client, login):
    login("admin")
    vouchers = client.get("/api/vouchers/page?page=1&page_size=1").json()
    transactions = client.get("/api/transactions/page?page=1&page_size=1&book=cash").json()
    assert len(vouchers["items"]) <= 1
    assert len(transactions["items"]) <= 1
