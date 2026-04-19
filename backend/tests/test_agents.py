"""Tests for agent logic (thesis generator, evaluator, interpreter, explanation)."""
from unittest.mock import patch, MagicMock


# ── Thesis Generator ─────────────────────────────────────────────────────────

def test_thesis_generator_fallback_on_api_error():
    from app.agents.thesis_generator import generate_thesis
    with patch("app.agents.thesis_generator._call_openai", side_effect=Exception("API down")):
        results = generate_thesis("TEST", "Test Corp")
    assert len(results) == 6  # one fallback per category
    assert all("[Add" in r.statement for r in results)


def test_thesis_generator_fallback_on_empty_response():
    from app.agents.thesis_generator import generate_thesis
    with patch("app.agents.thesis_generator._call_openai", return_value={}):
        results = generate_thesis("TEST", "Test Corp")
    assert len(results) == 6  # fallback


def test_thesis_generator_truncates_to_5_per_category():
    from app.agents.thesis_generator import generate_thesis, CATEGORIES
    many_bullets = [f"Bullet {i}" for i in range(10)]
    data = {cat: many_bullets for cat in CATEGORIES}
    with patch("app.agents.thesis_generator._call_openai", return_value=data):
        results = generate_thesis("TEST", "Test Corp")
    per_category = {}
    for r in results:
        per_category[r.category] = per_category.get(r.category, 0) + 1
    assert all(count <= 5 for count in per_category.values())


def test_thesis_generator_returns_correct_categories():
    """Each category gets a statement containing at least one quality-gate keyword so we
    test routing, not content quality."""
    from app.agents.thesis_generator import generate_thesis, CATEGORIES
    seed = {
        "competitive_moat": "Durable network-effect moat with strong switching costs.",
        "growth_trajectory": "Revenue growth has compounded in expanding end-markets.",
        "valuation": "Trades at a discount P/E multiple versus peers today.",
        "financial_health": "Generates strong free cash flow with conservative debt levels.",
        "ownership_conviction": "Heavy insider ownership aligns with institutional conviction.",
        "risks": "Regulatory risk around antitrust and execution risk on new launches.",
    }
    data = {cat: [{"statement": seed[cat], "importance": "standard"}] for cat in CATEGORIES}
    with patch("app.agents.thesis_generator._call_openai", return_value=data):
        results = generate_thesis("AAPL", "Apple")
    cats = {r.category for r in results}
    assert cats == set(CATEGORIES)


# ── Thesis Evaluator ──────────────────────────────────────────────────────────

def test_evaluator_credits_positive_signals():
    from app.agents.thesis_evaluator import evaluate_thesis
    from app.agents.signal_interpreter import ThesisSignalMapping
    mappings = [
        ThesisSignalMapping(
            thesis_id=1, category="competitive_moat", statement="Strong moat.",
            sentiment="positive", confidence=0.8, signal_summary="Price up 10%"
        )
    ]
    result = evaluate_thesis(mappings)
    # base=50, credit=8.0*0.8=6.4 → 56.4
    assert result.score > 50.0
    assert result.broken_points == []
    assert len(result.confirmed_points) == 1


def test_evaluator_deducts_for_negative_high_confidence():
    from app.agents.thesis_evaluator import evaluate_thesis
    from app.agents.signal_interpreter import ThesisSignalMapping
    mappings = [
        ThesisSignalMapping(
            thesis_id=1, category="competitive_moat", statement="Strong moat.",
            sentiment="negative", confidence=0.9, signal_summary="Revenue fell 20%"
        )
    ]
    result = evaluate_thesis(mappings)
    assert result.score < 100.0
    assert len(result.broken_points) == 1


def test_evaluator_ignores_low_confidence_negatives():
    from app.agents.thesis_evaluator import evaluate_thesis
    from app.agents.signal_interpreter import ThesisSignalMapping
    mappings = [
        ThesisSignalMapping(
            thesis_id=1, category="competitive_moat", statement="Strong moat.",
            sentiment="negative", confidence=0.3,  # below threshold
            signal_summary="Mild rumour"
        )
    ]
    result = evaluate_thesis(mappings)
    # Low confidence → no deduction; base=50
    assert result.score == 50.0
    assert result.broken_points == []


def test_evaluator_status_thresholds():
    from app.agents.thesis_evaluator import evaluate_thesis, CATEGORY_CREDITS, CATEGORY_DEDUCTIONS
    from app.agents.signal_interpreter import ThesisSignalMapping

    def make_neg(thesis_id: int) -> ThesisSignalMapping:
        return ThesisSignalMapping(
            thesis_id=thesis_id, category="competitive_moat", statement="Belief.",
            sentiment="negative", confidence=1.0, signal_summary="Bad news"
        )

    def make_pos(thesis_id: int) -> ThesisSignalMapping:
        return ThesisSignalMapping(
            thesis_id=thesis_id, category="competitive_moat", statement="Belief.",
            sentiment="positive", confidence=1.0, signal_summary="Good news"
        )

    # No signals → base score 50 (yellow)
    r0 = evaluate_thesis([])
    assert r0.score == 50.0
    assert r0.status == "yellow"

    # 1 negative (deduction=8.0): 50-8=42 → red
    r1 = evaluate_thesis([make_neg(1)])
    assert r1.status == "red"
    assert len(r1.broken_points) == 1

    # Many positives → score approaches 100 and stays ≤ 100
    r2 = evaluate_thesis([make_pos(i) for i in range(20)])
    assert r2.score <= 100.0
    assert r2.status == "green"

    # Many negatives → score approaches 0 and stays ≥ 0
    r3 = evaluate_thesis([make_neg(i) for i in range(20)])
    assert r3.score >= 0.0
    assert r3.status == "red"


def test_evaluator_score_never_below_zero():
    from app.agents.thesis_evaluator import evaluate_thesis
    from app.agents.signal_interpreter import ThesisSignalMapping
    mappings = [
        ThesisSignalMapping(
            thesis_id=i, category="competitive_moat", statement="Belief.",
            sentiment="negative", confidence=1.0, signal_summary="Terrible"
        )
        for i in range(20)
    ]
    result = evaluate_thesis(mappings)
    assert result.score >= 0.0


def test_evaluator_importance_multiplier():
    from app.agents.thesis_evaluator import evaluate_thesis
    from app.agents.signal_interpreter import ThesisSignalMapping
    mapping = ThesisSignalMapping(
        thesis_id=1, category="competitive_moat", statement="Strong moat.",
        sentiment="negative", confidence=1.0, signal_summary="Moat weakening"
    )

    # Standard importance: deduction = 8.0 * 1.0 * 1.0 = 8.0
    r_std = evaluate_thesis([mapping], {1: {"importance": "standard", "frozen": False}})
    # Critical importance: deduction = 8.0 * 1.0 * 2.0 = 16.0
    r_crit = evaluate_thesis([mapping], {1: {"importance": "critical", "frozen": False}})
    assert r_crit.score < r_std.score  # critical deduction is heavier


def test_evaluator_frozen_break_detection():
    from app.agents.thesis_evaluator import evaluate_thesis
    from app.agents.signal_interpreter import ThesisSignalMapping
    mapping = ThesisSignalMapping(
        thesis_id=42, category="competitive_moat", statement="Core conviction point.",
        sentiment="negative", confidence=0.8, signal_summary="Conviction broken"
    )

    result = evaluate_thesis([mapping], {42: {"importance": "standard", "frozen": True}})
    assert len(result.frozen_breaks) == 1
    assert result.frozen_breaks[0]["thesis_id"] == 42

    # Non-frozen should not appear in frozen_breaks
    result2 = evaluate_thesis([mapping], {42: {"importance": "standard", "frozen": False}})
    assert len(result2.frozen_breaks) == 0


# ── Explanation Agent ─────────────────────────────────────────────────────────

def test_explanation_no_broken_points_returns_intact_message():
    from app.agents.explanation_agent import generate_explanation
    from app.agents.thesis_evaluator import EvaluationResult
    result = EvaluationResult(score=100.0, status="green", broken_points=[])
    explanation = generate_explanation("AAPL", result)
    assert "intact" in explanation.lower() or "no significant" in explanation.lower()


def test_explanation_fallback_without_api_key():
    from app.agents.explanation_agent import generate_explanation, _template_explanation
    from app.agents.thesis_evaluator import EvaluationResult
    broken = [{"category": "competitive_moat", "statement": "Strong moat.", "signal": "Revenue fell.", "deduction": 15.0, "sentiment": "negative"}]
    result = EvaluationResult(score=85.0, status="green", broken_points=broken)
    explanation = _template_explanation("AAPL", result)
    assert "AAPL" in explanation
    assert len(explanation) > 10


def test_explanation_openai_failure_falls_back_to_template():
    from app.agents.explanation_agent import generate_explanation
    from app.agents.thesis_evaluator import EvaluationResult
    broken = [{"category": "competitive_moat", "statement": "Strong moat.", "signal": "Bad news.", "deduction": 15.0, "sentiment": "negative"}]
    result = EvaluationResult(score=85.0, status="green", broken_points=broken)
    # OpenAI is imported lazily inside the function, so patch at the source module
    with patch("openai.OpenAI", side_effect=Exception("No API")):
        explanation = generate_explanation("AAPL", result)
    assert "AAPL" in explanation


# ── Signal Interpreter ────────────────────────────────────────────────────────

def test_signal_interpreter_returns_empty_for_no_theses():
    from app.agents.signal_interpreter import interpret_signals
    from app.agents.signal_collector import CollectedSignals
    signals = CollectedSignals(ticker="AAPL", price=None, news=[])
    result = interpret_signals(signals, [])
    assert result == []


def test_signal_interpreter_price_rules_detect_downtrend():
    from app.agents.signal_interpreter import _price_rules
    from app.agents.signal_collector import PriceSignal

    price = PriceSignal(
        ticker="AAPL",
        current_price=100.0,
        prev_close=115.0,
        day_change_pct=-5.0,
        week_change_pct=-10.0,
        month_change_pct=-20.0,  # triggers deduction for competitive_moat/strengths
        fifty_two_week_high=200.0,
        fifty_two_week_low=80.0,
        avg_volume_10d=1_000_000,
        current_volume=1_000_000,
        volume_ratio=1.0,
        ma_20=95.0,
        ma_50=110.0,
        trend="down",
        available=True,
    )

    theses = [
        {"id": 1, "category": "competitive_moat", "statement": "Strong business model.", "weight": 1.0},
    ]

    mappings = _price_rules(price, theses)
    negative_maps = [m for m in mappings if m.sentiment == "negative"]
    assert len(negative_maps) >= 1
