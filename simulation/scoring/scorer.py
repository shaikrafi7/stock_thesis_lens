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

from app.agents.signal_interpreter import interpret_signals
from app.agents.thesis_evaluator import evaluate_thesis, EvaluationResult

from simulation.scoring.signal_builder import build_signals
from simulation.scoring.thesis_templates import THESIS_TEMPLATES, THESIS_META


@dataclass
class ScoredStock:
    ticker: str
    score_date: date
    score: float
    status: str
    signal_count: int


def score_ticker(ticker: str, as_of: date) -> ScoredStock | None:
    """Score a ticker as of a historical date using the production engine.

    Returns None if insufficient data is available.
    """
    signals = build_signals(ticker, as_of)

    # Need at least price data to score
    if signals.price is None:
        return None

    selected = [t for t in THESIS_TEMPLATES if t.get("selected", True)]
    mappings = interpret_signals(signals, selected)

    result: EvaluationResult = evaluate_thesis(mappings, thesis_meta=THESIS_META)

    return ScoredStock(
        ticker=ticker,
        score_date=as_of,
        score=result.score,
        status=result.status,
        signal_count=len(mappings),
    )


def score_universe(tickers: list[str], as_of: date) -> list[ScoredStock]:
    """Score all tickers at a given date. Skips tickers with no data."""
    results = []
    for ticker in tickers:
        scored = score_ticker(ticker, as_of)
        if scored is not None:
            results.append(scored)
    return results
