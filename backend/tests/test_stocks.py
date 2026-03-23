"""Tests for /stocks endpoints."""
from unittest.mock import patch, MagicMock


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_create_stock(client):
    r = client.post("/stocks", json={"ticker": "aapl", "name": "Apple Inc."})
    assert r.status_code == 201
    data = r.json()
    assert data["ticker"] == "AAPL"  # uppercased
    assert data["name"] == "Apple Inc."
    assert "id" in data


def test_create_stock_auto_uppercase(client):
    r = client.post("/stocks", json={"ticker": "nvda", "name": "NVIDIA"})
    assert r.status_code == 201
    assert r.json()["ticker"] == "NVDA"


def test_create_stock_duplicate_returns_409(client):
    client.post("/stocks", json={"ticker": "AAPL", "name": "Apple"})
    r = client.post("/stocks", json={"ticker": "aapl", "name": "Apple"})
    assert r.status_code == 409
    assert "already exists" in r.json()["detail"]


def test_list_stocks_empty(client):
    r = client.get("/stocks")
    assert r.status_code == 200
    assert r.json() == []


def test_list_stocks_ordered_alphabetically(client):
    client.post("/stocks", json={"ticker": "TSLA", "name": "Tesla"})
    client.post("/stocks", json={"ticker": "AAPL", "name": "Apple"})
    client.post("/stocks", json={"ticker": "MSFT", "name": "Microsoft"})
    r = client.get("/stocks")
    tickers = [s["ticker"] for s in r.json()]
    assert tickers == ["AAPL", "MSFT", "TSLA"]


def test_get_stock(client):
    client.post("/stocks", json={"ticker": "AAPL", "name": "Apple"})
    r = client.get("/stocks/AAPL")
    assert r.status_code == 200
    assert r.json()["ticker"] == "AAPL"


def test_get_stock_case_insensitive(client):
    client.post("/stocks", json={"ticker": "AAPL", "name": "Apple"})
    r = client.get("/stocks/aapl")
    assert r.status_code == 200


def test_get_stock_not_found(client):
    r = client.get("/stocks/FAKE")
    assert r.status_code == 404


def test_delete_stock(client):
    client.post("/stocks", json={"ticker": "AAPL", "name": "Apple"})
    r = client.delete("/stocks/AAPL")
    assert r.status_code == 204
    r2 = client.get("/stocks/AAPL")
    assert r2.status_code == 404


def test_delete_stock_not_found(client):
    r = client.delete("/stocks/FAKE")
    assert r.status_code == 404


# ── Ticker validation ────────────────────────────────────────────────────────

def test_create_stock_rejects_ticker_with_spaces(client):
    """Company name typed instead of ticker (has spaces) should be rejected."""
    r = client.post("/stocks", json={"ticker": "NEBIUS GROUP", "name": ""})
    assert r.status_code == 422
    assert "not a valid ticker" in r.json()["detail"].lower() or "ticker" in r.json()["detail"].lower()


def test_create_stock_rejects_nonexistent_ticker_via_polygon(client):
    """Polygon 404 for fake ticker → 422 response."""
    mock_resp = MagicMock()
    mock_resp.status_code = 404

    with patch("app.routers.stocks.settings") as mock_settings, \
         patch("app.routers.stocks.httpx.get", return_value=mock_resp):
        mock_settings.POLYGON_API_KEY = "fake_test_key"
        mock_settings.DATABASE_URL = "sqlite://"  # keep other settings intact
        r = client.post("/stocks", json={"ticker": "ZZZZZZ", "name": ""})

    assert r.status_code == 422
    assert "not found" in r.json()["detail"].lower()


def test_create_stock_uses_polygon_company_name(client):
    """When Polygon returns a real name, it should be stored (not the ticker)."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"results": {"name": "Apple Inc."}}

    with patch("app.routers.stocks.settings") as mock_settings, \
         patch("app.routers.stocks.httpx.get", return_value=mock_resp):
        mock_settings.POLYGON_API_KEY = "fake_test_key"
        mock_settings.DATABASE_URL = "sqlite://"
        r = client.post("/stocks", json={"ticker": "AAPL", "name": ""})

    assert r.status_code == 201
    assert r.json()["name"] == "Apple Inc."
