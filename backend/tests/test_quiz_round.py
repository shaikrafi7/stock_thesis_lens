"""Tests for /portfolio/quiz/round endpoint."""
from unittest.mock import patch


def _seed_stocks_with_theses(client, n_stocks=4, points_per_stock=3):
    """Add n stocks and generate + select a few theses on each."""
    from app.agents.thesis_generator import GeneratedThesis

    tickers = [f"TIC{i}" for i in range(n_stocks)]
    for tic in tickers:
        client.post("/stocks", json={"ticker": tic, "name": f"Company {tic}"})

    categories = ["competitive_moat", "growth_trajectory", "valuation", "financial_health"]
    neutral_statements = [
        "Strong recurring revenue with high retention.",
        "Gross margins expanded meaningfully last quarter.",
        "Trading below peer multiples on forward earnings.",
        "Free cash flow covers debt obligations several times over.",
        "Management has consistently reinvested at high returns.",
        "Regulatory risk could compress margins materially.",
    ]
    for tic in tickers:
        with patch("app.routers.thesis.generate_thesis") as mock_gen:
            mock_gen.return_value = [
                GeneratedThesis(category=categories[i % len(categories)], statement=neutral_statements[i % len(neutral_statements)])
                for i in range(points_per_stock)
            ]
            client.post(f"/stocks/{tic}/generate-thesis")


def test_quiz_round_returns_mixed_questions(client):
    _seed_stocks_with_theses(client, n_stocks=4, points_per_stock=3)
    r = client.get("/portfolio/quiz/round?size=10")
    assert r.status_code == 200
    data = r.json()
    assert "questions" in data
    assert len(data["questions"]) >= 3
    for q in data["questions"]:
        assert q["type"] in {"thesis_to_stock", "point_to_category", "signal_impact", "closed_outcome"}
        assert 2 <= len(q["choices"]) <= 6
        assert 0 <= q["correct_index"] < len(q["choices"])


def test_quiz_round_does_not_leak_tickers_or_names_in_stems_or_choices(client):
    _seed_stocks_with_theses(client, n_stocks=3, points_per_stock=3)
    r = client.get("/portfolio/quiz/round?size=10")
    assert r.status_code == 200
    tickers = ["TIC0", "TIC1", "TIC2"]
    names = ["Company TIC0", "Company TIC1", "Company TIC2"]
    for q in r.json()["questions"]:
        for t in tickers:
            assert t not in q["stem"], f"ticker {t} leaked in stem: {q['stem']}"
            for choice in q["choices"]:
                assert t not in choice, f"ticker {t} leaked in choice: {choice}"
        for n in names:
            assert n not in q["stem"], f"name {n} leaked in stem: {q['stem']}"
            for choice in q["choices"]:
                assert n not in choice, f"name {n} leaked in choice: {choice}"
        # Reveal is allowed to contain the ticker + name (shown after answer)
        assert q["reveal"]


def test_quiz_thesis_to_stock_uses_anonymous_holding_labels(client):
    _seed_stocks_with_theses(client, n_stocks=4, points_per_stock=3)
    r = client.get("/portfolio/quiz/round?size=10")
    assert r.status_code == 200
    t2s_questions = [q for q in r.json()["questions"] if q["type"] == "thesis_to_stock"]
    assert t2s_questions, "expected at least one thesis_to_stock question"
    for q in t2s_questions:
        for choice in q["choices"]:
            assert choice.startswith("Holding "), f"choice should be anonymized: {choice}"


def test_quiz_round_rejects_insufficient_data(client):
    client.post("/stocks", json={"ticker": "ONE", "name": "Only One Co"})
    r = client.get("/portfolio/quiz/round?size=10")
    assert r.status_code == 422
