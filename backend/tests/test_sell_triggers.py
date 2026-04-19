"""Tests for sell-trigger CRUD and the evaluation-time firing hook."""
from unittest.mock import patch


def _seed_stock_and_thesis(client):
    from app.agents.thesis_generator import GeneratedThesis
    client.post("/stocks", json={"ticker": "AAPL", "name": "Apple"})
    with patch("app.routers.thesis.generate_thesis") as m:
        m.return_value = [
            GeneratedThesis(category="valuation", statement="Multiples compress if growth slows."),
            GeneratedThesis(category="financial_health", statement="Strong balance sheet."),
            GeneratedThesis(category="growth_trajectory", statement="Services revenue still accelerating."),
        ]
        client.post("/stocks/AAPL/generate-thesis")
    theses = client.get("/stocks/AAPL/theses").json()
    return theses[0]["id"]


def test_create_and_list_triggers(client):
    tid = _seed_stock_and_thesis(client)
    r = client.post("/triggers", json={
        "thesis_id": tid, "metric": "price", "operator": ">", "threshold": 300.0,
        "note": "If it overshoots my fair value",
    })
    assert r.status_code == 200
    created = r.json()
    assert created["status"] == "watching"
    assert created["metric"] == "price"
    assert created["threshold"] == 300.0

    listed = client.get(f"/triggers?thesis_id={tid}").json()
    assert len(listed) == 1
    assert listed[0]["id"] == created["id"]


def test_update_and_delete_trigger(client):
    tid = _seed_stock_and_thesis(client)
    trig_id = client.post("/triggers", json={
        "thesis_id": tid, "metric": "score", "operator": "<", "threshold": 40.0,
    }).json()["id"]

    r = client.patch(f"/triggers/{trig_id}", json={"status": "dismissed"})
    assert r.status_code == 200
    assert r.json()["status"] == "dismissed"

    r = client.delete(f"/triggers/{trig_id}")
    assert r.status_code == 200
    assert client.get(f"/triggers?thesis_id={tid}").json() == []


def test_rejects_bad_metric_or_operator(client):
    tid = _seed_stock_and_thesis(client)
    bad_metric = client.post("/triggers", json={
        "thesis_id": tid, "metric": "moon_phase", "operator": ">", "threshold": 1.0,
    })
    assert bad_metric.status_code == 400
    bad_op = client.post("/triggers", json={
        "thesis_id": tid, "metric": "price", "operator": "~", "threshold": 1.0,
    })
    assert bad_op.status_code == 400


def test_trigger_fires_on_evaluation_when_score_crosses_threshold(client):
    """A score<50 trigger fires when an evaluation is saved with score 30."""
    from tests.conftest import TestSessionLocal
    from app.models.stock import Stock
    from app.models.evaluation import Evaluation
    from app.models.sell_trigger import SellTrigger
    from app.models.thesis_audit import ThesisAudit
    from app.services.evaluation_service import _check_and_fire_triggers

    tid = _seed_stock_and_thesis(client)
    client.post("/triggers", json={
        "thesis_id": tid, "metric": "score", "operator": "<", "threshold": 50.0,
    })

    db = TestSessionLocal()
    try:
        stock = db.query(Stock).filter(Stock.ticker == "AAPL").first()
        eval_row = Evaluation(stock_id=stock.id, score=30.0, status="broken", explanation="test")
        db.add(eval_row)
        db.commit()
        db.refresh(eval_row)
        _check_and_fire_triggers(stock, eval_row, db)

        trig = db.query(SellTrigger).first()
        assert trig.status == "triggered"
        assert trig.triggered_value == 30.0

        audit = db.query(ThesisAudit).filter(ThesisAudit.action == "trigger_fired").first()
        assert audit is not None
        assert audit.field_changed == "score"
    finally:
        db.close()
