"""Tests for deterministic trend-label helpers in signal_collector."""
from app.agents.signal_collector import (
    _label_trend,
    compute_revenue_trend,
    compute_margin_trend,
    compute_debt_trend,
)


def test_label_trend_accelerating():
    assert _label_trend(150.0, [100.0, 100.0]) == "accelerating"


def test_label_trend_decelerating():
    assert _label_trend(70.0, [100.0, 100.0]) == "decelerating"


def test_label_trend_stable_within_threshold():
    assert _label_trend(110.0, [100.0, 100.0]) == "stable"


def test_label_trend_returns_none_with_insufficient_data():
    assert _label_trend(100.0, [100.0]) is None
    assert _label_trend(None, [100.0, 100.0, 100.0]) is None


def test_label_trend_inverts_when_higher_is_worse():
    # Debt rising 50% is decelerating for thesis when higher_is_better=False.
    assert _label_trend(150.0, [100.0, 100.0], higher_is_better=False) == "decelerating"
    assert _label_trend(70.0, [100.0, 100.0], higher_is_better=False) == "accelerating"


def test_compute_revenue_trend_needs_three_quarters():
    assert compute_revenue_trend([]) is None
    assert compute_revenue_trend([{"revenue": 100}, {"revenue": 80}]) is None
    income = [{"revenue": 150}, {"revenue": 100}, {"revenue": 100}, {"revenue": 100}]
    assert compute_revenue_trend(income) == "accelerating"


def test_compute_margin_trend_from_revenue_and_gross_profit():
    income = [
        {"revenue": 100, "grossProfit": 65},  # 65% margin — latest
        {"revenue": 100, "grossProfit": 50},
        {"revenue": 100, "grossProfit": 50},
        {"revenue": 100, "grossProfit": 50},
    ]
    # 65% vs avg 50% = +30% relative -> accelerating
    assert compute_margin_trend(income) == "accelerating"


def test_compute_debt_trend_treats_rising_debt_as_deceleration():
    balance = [
        {"totalDebt": 150},
        {"totalDebt": 100},
        {"totalDebt": 100},
        {"totalDebt": 100},
    ]
    assert compute_debt_trend(balance) == "decelerating"
