"""Tests for thesis generation and selection endpoints."""
from unittest.mock import patch


MOCK_BULLETS = {
    "competitive_moat": ["Strong ecosystem creates durable competitive moat."],
    "growth_trajectory": ["High gross margins support R&D reinvestment."],
    "valuation": ["Trading below peer average on PEG basis."],
    "financial_health": ["Free cash flow exceeds all debt obligations."],
    "ownership_conviction": ["Institutional ownership above 80 percent."],
    "risks": ["Concentration risk in single product line."],
}


def _add_stock(client, ticker="AAPL", name="Apple Inc."):
    return client.post("/stocks", json={"ticker": ticker, "name": name})


def test_generate_thesis_stock_not_found(client):
    r = client.post("/stocks/FAKE/generate-thesis")
    assert r.status_code == 404


def test_generate_thesis_calls_agent_and_saves(client):
    _add_stock(client)
    with patch("app.routers.thesis.generate_thesis") as mock_gen:
        from app.agents.thesis_generator import GeneratedThesis
        mock_gen.return_value = [
            GeneratedThesis(category=cat, statement=stmts[0])
            for cat, stmts in MOCK_BULLETS.items()
        ]
        r = client.post("/stocks/AAPL/generate-thesis")

    assert r.status_code == 200
    data = r.json()
    assert len(data) == 6
    categories = {item["category"] for item in data}
    assert categories == set(MOCK_BULLETS.keys())
    assert all(item["selected"] is True for item in data)  # all auto-selected


def test_generate_thesis_preserves_selections_on_regenerate(client):
    _add_stock(client)
    with patch("app.routers.thesis.generate_thesis") as mock_gen:
        from app.agents.thesis_generator import GeneratedThesis
        stmt = "Strong ecosystem creates durable competitive moat."
        mock_gen.return_value = [GeneratedThesis(category="competitive_moat", statement=stmt)]
        r = client.post("/stocks/AAPL/generate-thesis")

    thesis_id = r.json()[0]["id"]

    # Select it
    client.patch(f"/stocks/AAPL/theses/{thesis_id}", json={"selected": True})

    # Regenerate with same statement — selection should be preserved
    with patch("app.routers.thesis.generate_thesis") as mock_gen2:
        from app.agents.thesis_generator import GeneratedThesis
        mock_gen2.return_value = [GeneratedThesis(category="competitive_moat", statement=stmt)]
        r2 = client.post("/stocks/AAPL/generate-thesis")

    assert r2.json()[0]["selected"] is True


def test_get_theses(client):
    _add_stock(client)
    with patch("app.routers.thesis.generate_thesis") as mock_gen:
        from app.agents.thesis_generator import GeneratedThesis
        mock_gen.return_value = [GeneratedThesis(category="competitive_moat", statement="Test belief.")]
        client.post("/stocks/AAPL/generate-thesis")

    r = client.get("/stocks/AAPL/theses")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_update_thesis_selection(client):
    _add_stock(client)
    with patch("app.routers.thesis.generate_thesis") as mock_gen:
        from app.agents.thesis_generator import GeneratedThesis
        mock_gen.return_value = [GeneratedThesis(category="competitive_moat", statement="Belief.")]
        r = client.post("/stocks/AAPL/generate-thesis")

    thesis_id = r.json()[0]["id"]

    r2 = client.patch(f"/stocks/AAPL/theses/{thesis_id}", json={"selected": True})
    assert r2.status_code == 200
    assert r2.json()["selected"] is True

    r3 = client.patch(f"/stocks/AAPL/theses/{thesis_id}", json={"selected": False})
    assert r3.json()["selected"] is False


def test_update_thesis_wrong_stock_returns_404(client):
    _add_stock(client, "AAPL")
    _add_stock(client, "NVDA")

    with patch("app.routers.thesis.generate_thesis") as mock_gen:
        from app.agents.thesis_generator import GeneratedThesis
        mock_gen.return_value = [GeneratedThesis(category="competitive_moat", statement="Belief.")]
        r = client.post("/stocks/AAPL/generate-thesis")

    thesis_id = r.json()[0]["id"]
    # Try to update AAPL thesis via NVDA route
    r2 = client.patch(f"/stocks/NVDA/theses/{thesis_id}", json={"selected": True})
    assert r2.status_code == 404


def _seed_thesis(client, ticker="AAPL"):
    _add_stock(client, ticker)
    with patch("app.routers.thesis.generate_thesis") as mock_gen:
        from app.agents.thesis_generator import GeneratedThesis
        mock_gen.return_value = [GeneratedThesis(
            category="competitive_moat",
            statement="Durable ecosystem moat.",
        )]
        r = client.post(f"/stocks/{ticker}/generate-thesis")
    return r.json()[0]["id"]


def test_close_thesis_records_outcome_and_lessons(client):
    thesis_id = _seed_thesis(client)

    r = client.post(
        f"/stocks/AAPL/theses/{thesis_id}/close",
        json={"outcome": "played_out", "lessons": "Watching margin expansion paid off."},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["outcome"] == "played_out"
    assert body["lessons"].startswith("Watching")
    assert body["closed_at"] is not None

    # Closed theses hidden from default list; visible with include_closed
    active = client.get("/stocks/AAPL/theses").json()
    assert all(t["id"] != thesis_id for t in active)
    all_theses = client.get("/stocks/AAPL/theses?include_closed=true").json()
    assert any(t["id"] == thesis_id for t in all_theses)


def test_close_requires_lessons(client):
    thesis_id = _seed_thesis(client)
    r = client.post(
        f"/stocks/AAPL/theses/{thesis_id}/close",
        json={"outcome": "failed", "lessons": "short"},
    )
    assert r.status_code == 422


def test_close_twice_is_rejected(client):
    thesis_id = _seed_thesis(client)
    client.post(
        f"/stocks/AAPL/theses/{thesis_id}/close",
        json={"outcome": "partial", "lessons": "Mid-cycle exit worked partially."},
    )
    r2 = client.post(
        f"/stocks/AAPL/theses/{thesis_id}/close",
        json={"outcome": "failed", "lessons": "Another close attempt here."},
    )
    assert r2.status_code == 400


def test_reopen_thesis_clears_closure(client):
    thesis_id = _seed_thesis(client)
    client.post(
        f"/stocks/AAPL/theses/{thesis_id}/close",
        json={"outcome": "failed", "lessons": "Thesis broke on earnings miss."},
    )
    r = client.post(f"/stocks/AAPL/theses/{thesis_id}/reopen")
    assert r.status_code == 200
    body = r.json()
    assert body["closed_at"] is None
    assert body["outcome"] is None


def test_audit_log_lists_closed_theses_across_stocks(client):
    id1 = _seed_thesis(client, "AAPL")
    id2 = _seed_thesis(client, "NVDA")
    client.post(
        f"/stocks/AAPL/theses/{id1}/close",
        json={"outcome": "played_out", "lessons": "Moat held up in earnings."},
    )
    client.post(
        f"/stocks/NVDA/theses/{id2}/close",
        json={"outcome": "failed", "lessons": "Datacenter growth overestimated."},
    )
    r = client.get("/audit-log")
    assert r.status_code == 200
    rows = r.json()
    tickers = {row["ticker"] for row in rows}
    assert {"AAPL", "NVDA"} <= tickers
    assert all("outcome" in row and "lessons" in row for row in rows)


def test_audit_log_filters_by_outcome_and_search(client):
    aapl = _seed_thesis(client, "AAPL")
    nvda = _seed_thesis(client, "NVDA")
    client.post(
        f"/stocks/AAPL/theses/{aapl}/close",
        json={"outcome": "played_out", "lessons": "Moat durability confirmed."},
    )
    client.post(
        f"/stocks/NVDA/theses/{nvda}/close",
        json={"outcome": "failed", "lessons": "Growth rate proved unsustainable."},
    )

    played = client.get("/audit-log?outcome=played_out").json()
    assert len(played) == 1 and played[0]["ticker"] == "AAPL"

    search = client.get("/audit-log?q=unsustainable").json()
    assert len(search) == 1 and search[0]["ticker"] == "NVDA"
