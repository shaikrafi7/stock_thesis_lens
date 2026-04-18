"""Wrapper around production scoring engine for historical simulation.

Loads historical signals for (ticker, date) and runs the production
interpret_signals() + evaluate_thesis() pipeline unchanged.
"""
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path

# Add backend and project root to sys.path for production imports
_SIM_DIR = Path(__file__).parent.parent
_BACKEND = _SIM_DIR.parent / "backend"
_PROJECT_ROOT = _SIM_DIR.parent
for _p in [str(_BACKEND), str(_PROJECT_ROOT)]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

from app.agents.signal_interpreter import interpret_signals, ThesisSignalMapping
from app.agents.thesis_evaluator import (
    evaluate_thesis, EvaluationResult,
    CATEGORY_CREDITS, CATEGORY_DEDUCTIONS,
)

from simulation.scoring.signal_builder import build_signals
from simulation.scoring.thesis_templates import THESIS_TEMPLATES, THESIS_META
from simulation.scoring.config import ScoringConfig, resolve_weights, sector_of

CATEGORIES = [
    "competitive_moat", "growth_trajectory", "valuation",
    "financial_health", "ownership_conviction", "risks",
]


@dataclass
class ScoredStock:
    ticker: str
    score_date: date
    score: float
    status: str
    signal_count: int


def score_ticker(
    ticker: str,
    as_of: date,
    config: ScoringConfig | None = None,
    regime_key: str | None = None,
) -> ScoredStock | None:
    """Score a ticker as of a historical date using the production engine.

    Returns None if insufficient data is available.

    When config is provided, regime_key and ticker's sector are used to
    compute adjusted category weights before calling evaluate_thesis.
    """
    signals = build_signals(ticker, as_of)

    # Need at least price data to score
    if signals.price is None:
        return None

    selected = [t for t in THESIS_TEMPLATES if t.get("selected", True)]
    mappings = interpret_signals(signals, selected)

    if config is not None and not config.is_noop:
        sector = sector_of(ticker)
        credits, deductions = resolve_weights(config, regime_key, sector)
        result: EvaluationResult = evaluate_thesis(
            mappings,
            thesis_meta=THESIS_META,
            category_credits=credits,
            category_deductions=deductions,
        )
    else:
        result = evaluate_thesis(mappings, thesis_meta=THESIS_META)

    return ScoredStock(
        ticker=ticker,
        score_date=as_of,
        score=result.score,
        status=result.status,
        signal_count=len(mappings),
    )


def score_universe(
    tickers: list[str],
    as_of: date,
    config: ScoringConfig | None = None,
    regime_key: str | None = None,
) -> list[ScoredStock]:
    """Score all tickers at a given date. Skips tickers with no data."""
    results = []
    for ticker in tickers:
        scored = score_ticker(ticker, as_of, config=config, regime_key=regime_key)
        if scored is not None:
            results.append(scored)
    return results


# ── Variants for studies ────────────────────────────────────────────────

def _get_mappings(ticker: str, as_of: date) -> list[ThesisSignalMapping] | None:
    """Get raw signal mappings for a ticker/date (shared helper)."""
    signals = build_signals(ticker, as_of)
    if signals.price is None:
        return None
    selected = [t for t in THESIS_TEMPLATES if t.get("selected", True)]
    return interpret_signals(signals, selected)


def score_universe_ablation(
    tickers: list[str], as_of: date, exclude_category: str,
) -> list[ScoredStock]:
    """Score all tickers, excluding all mappings for one category."""
    results = []
    for ticker in tickers:
        mappings = _get_mappings(ticker, as_of)
        if mappings is None:
            continue
        filtered = [m for m in mappings if m.category != exclude_category]
        result = evaluate_thesis(filtered, thesis_meta=THESIS_META)
        results.append(ScoredStock(
            ticker=ticker, score_date=as_of,
            score=result.score, status=result.status,
            signal_count=len(filtered),
        ))
    return results


def score_universe_by_category(
    tickers: list[str], as_of: date,
) -> dict[str, dict[str, float]]:
    """Score using only one category at a time. Returns {category: {ticker: score}}."""
    cat_scores: dict[str, dict[str, float]] = {c: {} for c in CATEGORIES}
    for ticker in tickers:
        mappings = _get_mappings(ticker, as_of)
        if mappings is None:
            continue
        for cat in CATEGORIES:
            cat_only = [m for m in mappings if m.category == cat]
            if not cat_only:
                continue  # skip — no signals for this category
            result = evaluate_thesis(cat_only, thesis_meta=THESIS_META)
            cat_scores[cat][ticker] = result.score
    return cat_scores


def score_universe_equal_weights(
    tickers: list[str], as_of: date,
) -> list[ScoredStock]:
    """Score all tickers with equal category weights (5.0 for all)."""
    import app.agents.thesis_evaluator as te

    # Save originals
    orig_credits = te.CATEGORY_CREDITS.copy()
    orig_deductions = te.CATEGORY_DEDUCTIONS.copy()

    # Set equal weights
    equal = {c: 5.0 for c in CATEGORIES}
    te.CATEGORY_CREDITS.update(equal)
    te.CATEGORY_DEDUCTIONS.update(equal)

    try:
        results = []
        for ticker in tickers:
            mappings = _get_mappings(ticker, as_of)
            if mappings is None:
                continue
            result = evaluate_thesis(mappings, thesis_meta=THESIS_META)
            results.append(ScoredStock(
                ticker=ticker, score_date=as_of,
                score=result.score, status=result.status,
                signal_count=len(mappings),
            ))
        return results
    finally:
        # Restore originals
        te.CATEGORY_CREDITS.update(orig_credits)
        te.CATEGORY_DEDUCTIONS.update(orig_deductions)
