"""Tests for thesis generation and selection endpoints."""
from unittest.mock import patch


MOCK_BULLETS = {
    "core_beliefs": ["Strong ecosystem creates durable competitive moat."],
    "strengths": ["High gross margins support R&D reinvestment."],
    "risks": ["Concentration risk in single product line."],
    "leadership": ["CEO has strong track record of capital allocation."],
    "catalysts": ["AI product roadmap opens new revenue streams."],
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
    assert len(data) == 5
    categories = {item["category"] for item in data}
    assert categories == set(MOCK_BULLETS.keys())
    assert all(item["selected"] is False for item in data)


def test_generate_thesis_preserves_selections_on_regenerate(client):
    _add_stock(client)
    with patch("app.routers.thesis.generate_thesis") as mock_gen:
        from app.agents.thesis_generator import GeneratedThesis
        stmt = "Strong ecosystem creates durable competitive moat."
        mock_gen.return_value = [GeneratedThesis(category="core_beliefs", statement=stmt)]
        r = client.post("/stocks/AAPL/generate-thesis")

    thesis_id = r.json()[0]["id"]

    # Select it
    client.patch(f"/stocks/AAPL/theses/{thesis_id}", json={"selected": True})

    # Regenerate with same statement — selection should be preserved
    with patch("app.routers.thesis.generate_thesis") as mock_gen2:
        from app.agents.thesis_generator import GeneratedThesis
        mock_gen2.return_value = [GeneratedThesis(category="core_beliefs", statement=stmt)]
        r2 = client.post("/stocks/AAPL/generate-thesis")

    assert r2.json()[0]["selected"] is True


def test_get_theses(client):
    _add_stock(client)
    with patch("app.routers.thesis.generate_thesis") as mock_gen:
        from app.agents.thesis_generator import GeneratedThesis
        mock_gen.return_value = [GeneratedThesis(category="core_beliefs", statement="Test belief.")]
        client.post("/stocks/AAPL/generate-thesis")

    r = client.get("/stocks/AAPL/theses")
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_update_thesis_selection(client):
    _add_stock(client)
    with patch("app.routers.thesis.generate_thesis") as mock_gen:
        from app.agents.thesis_generator import GeneratedThesis
        mock_gen.return_value = [GeneratedThesis(category="core_beliefs", statement="Belief.")]
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
        mock_gen.return_value = [GeneratedThesis(category="core_beliefs", statement="Belief.")]
        r = client.post("/stocks/AAPL/generate-thesis")

    thesis_id = r.json()[0]["id"]
    # Try to update AAPL thesis via NVDA route
    r2 = client.patch(f"/stocks/NVDA/theses/{thesis_id}", json={"selected": True})
    assert r2.status_code == 404
