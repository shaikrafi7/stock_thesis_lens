"""Tests for the full evaluation pipeline endpoint."""
import json
from unittest.mock import patch
from app.agents.thesis_generator import GeneratedThesis
from app.agents.signal_collector import CollectedSignals
from app.agents.signal_interpreter import ThesisSignalMapping
from app.agents.thesis_evaluator import EvaluationResult


def _setup_stock_with_selected_theses(client, ticker="AAPL"):
    """Helper: add stock, generate + select three thesis points (minimum required)."""
    client.post("/stocks", json={"ticker": ticker, "name": "Apple Inc."})
    with patch("app.routers.thesis.generate_thesis") as mock_gen:
        mock_gen.return_value = [
            GeneratedThesis(category="competitive_moat", statement="Strong ecosystem creates moat."),
            GeneratedThesis(category="growth_trajectory", statement="Best-in-class product design."),
            GeneratedThesis(category="risks", statement="Competition risk remains elevated."),
        ]
        r = client.post(f"/stocks/{ticker}/generate-thesis")
    theses = r.json()
    for t in theses:
        client.patch(f"/stocks/{ticker}/theses/{t['id']}", json={"selected": True})
    return theses[0]["id"]


def test_evaluate_stock_not_found(client):
    r = client.post("/stocks/FAKE/evaluate")
    assert r.status_code == 404


def test_evaluate_no_selected_theses_returns_422(client):
    client.post("/stocks", json={"ticker": "AAPL", "name": "Apple"})
    with patch("app.routers.thesis.generate_thesis") as mock_gen:
        mock_gen.return_value = [GeneratedThesis(category="competitive_moat", statement="Belief.")]
        client.post("/stocks/AAPL/generate-thesis")
    # Don't select any thesis
    r = client.post("/stocks/AAPL/evaluate")
    assert r.status_code == 422
    assert "3" in r.json()["detail"]


def test_evaluate_too_few_theses_selected_returns_422(client):
    """Fewer than 3 selected thesis points should be rejected."""
    client.post("/stocks", json={"ticker": "AAPL", "name": "Apple"})
    with patch("app.routers.thesis.generate_thesis") as mock_gen:
        mock_gen.return_value = [
            GeneratedThesis(category="competitive_moat", statement="Strong ecosystem."),
            GeneratedThesis(category="growth_trajectory", statement="Best-in-class design."),
        ]
        r = client.post("/stocks/AAPL/generate-thesis")
    # Select only 1 of the 2 generated
    thesis_id = r.json()[0]["id"]
    client.patch(f"/stocks/AAPL/theses/{thesis_id}", json={"selected": True})
    r = client.post("/stocks/AAPL/evaluate")
    assert r.status_code == 422
    assert "3" in r.json()["detail"]


def test_evaluate_full_pipeline_green(client):
    _setup_stock_with_selected_theses(client)

    no_signals = CollectedSignals(ticker="AAPL", price=None, news=[])
    no_mappings: list[ThesisSignalMapping] = []
    green_result = EvaluationResult(score=100.0, status="green", broken_points=[])

    with patch("app.services.evaluation_service.collect_signals", return_value=no_signals), \
         patch("app.services.evaluation_service.interpret_signals", return_value=no_mappings), \
         patch("app.services.evaluation_service.evaluate_thesis", return_value=green_result), \
         patch("app.services.evaluation_service.generate_explanation", return_value="Thesis intact."):
        r = client.post("/stocks/AAPL/evaluate")

    assert r.status_code == 200
    data = r.json()
    assert data["score"] == 100.0
    assert data["status"] == "green"
    assert data["explanation"] == "Thesis intact."
    assert data["broken_points"] == []


def test_evaluate_full_pipeline_red(client):
    _setup_stock_with_selected_theses(client)

    no_signals = CollectedSignals(ticker="AAPL", price=None, news=[])
    broken_mappings = [
        ThesisSignalMapping(
            thesis_id=1, category="competitive_moat", statement="Strong ecosystem.",
            sentiment="negative", confidence=1.0, signal_summary="Revenue collapsed."
        )
    ]
    red_result = EvaluationResult(
        score=40.0,
        status="red",
        broken_points=[{"thesis_id": 1, "category": "competitive_moat", "statement": "Strong ecosystem.",
                        "signal": "Revenue collapsed.", "sentiment": "negative", "deduction": 15.0}]
    )

    with patch("app.services.evaluation_service.collect_signals", return_value=no_signals), \
         patch("app.services.evaluation_service.interpret_signals", return_value=broken_mappings), \
         patch("app.services.evaluation_service.evaluate_thesis", return_value=red_result), \
         patch("app.services.evaluation_service.generate_explanation", return_value="Thesis breaking."):
        r = client.post("/stocks/AAPL/evaluate")

    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "red"
    assert len(data["broken_points"]) == 1
    assert data["broken_points"][0]["deduction"] == 15.0


def test_get_latest_evaluation_not_found(client):
    client.post("/stocks", json={"ticker": "AAPL", "name": "Apple"})
    r = client.get("/stocks/AAPL/evaluation")
    assert r.status_code == 404


def test_get_latest_evaluation_returns_most_recent(client):
    _setup_stock_with_selected_theses(client)

    no_signals = CollectedSignals(ticker="AAPL", price=None, news=[])

    def run_eval(score: float, status: str):
        result = EvaluationResult(score=score, status=status, broken_points=[])
        with patch("app.services.evaluation_service.collect_signals", return_value=no_signals), \
             patch("app.services.evaluation_service.interpret_signals", return_value=[]), \
             patch("app.services.evaluation_service.evaluate_thesis", return_value=result), \
             patch("app.services.evaluation_service.generate_explanation", return_value="ok"):
            client.post("/stocks/AAPL/evaluate")

    run_eval(score=90.0, status="green")
    run_eval(score=55.0, status="yellow")  # most recent

    r = client.get("/stocks/AAPL/evaluation")
    assert r.status_code == 200
    assert r.json()["score"] == 55.0
    assert r.json()["status"] == "yellow"


def test_evaluate_broken_points_stored_and_returned_as_list(client):
    _setup_stock_with_selected_theses(client)

    no_signals = CollectedSignals(ticker="AAPL", price=None, news=[])
    broken = [{"thesis_id": 1, "category": "competitive_moat", "statement": "Moat.",
               "signal": "Bad news.", "sentiment": "negative", "deduction": 15.0}]
    red_result = EvaluationResult(score=85.0, status="green", broken_points=broken)

    with patch("app.services.evaluation_service.collect_signals", return_value=no_signals), \
         patch("app.services.evaluation_service.interpret_signals", return_value=[]), \
         patch("app.services.evaluation_service.evaluate_thesis", return_value=red_result), \
         patch("app.services.evaluation_service.generate_explanation", return_value="ok"):
        client.post("/stocks/AAPL/evaluate")

    r = client.get("/stocks/AAPL/evaluation")
    assert isinstance(r.json()["broken_points"], list)
    assert r.json()["broken_points"][0]["signal"] == "Bad news."
