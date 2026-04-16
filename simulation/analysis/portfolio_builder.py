"""Build quintile portfolios from STARC scores.

Sorts stocks into Q1-Q5 (lowest to highest score) at each month-end date.
Applies a 1-month skip between score date and portfolio formation to avoid
microstructure biases (Jegadeesh-Titman skip-month convention).

NYSE breakpoints: approximated by market cap > $2B as large-cap proxy.
"""
from datetime import date
from dataclasses import dataclass

import sys
from pathlib import Path

import pandas as pd
import numpy as np

# Ensure project root is on path for simulation.* imports
_PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from simulation.scoring.scorer import ScoredStock


@dataclass
class Portfolio:
    formation_date: date       # month-end when portfolio is formed (score_date + 1m skip)
    score_date: date           # the date scores were computed
    quintile: int              # 1 (lowest) to 5 (highest)
    tickers: list[str]


def _month_end_dates(start: date, end: date) -> list[date]:
    """Generate month-end dates between start and end (inclusive)."""
    dates = pd.date_range(start=start, end=end, freq="BME")
    return [d.date() for d in dates]


def _add_one_month(d: date) -> date:
    """Add approximately one calendar month to a date."""
    month = d.month + 1
    year = d.year + (month > 12)
    month = month if month <= 12 else month - 12
    # Use last day of that month
    next_month_end = pd.Timestamp(year=year, month=month, day=1) + pd.offsets.MonthEnd(0)
    return next_month_end.date()


def assign_quintiles(scores: list[ScoredStock], large_cap_tickers: set[str] | None = None) -> dict[str, int]:
    """Assign quintile labels (1-5) to scored stocks.

    Uses NYSE breakpoints approximation: compute quintile boundaries using
    large-cap tickers only (proxy: tickers in large_cap_tickers set if provided),
    then apply to all tickers.

    Returns dict of {ticker: quintile}.
    """
    if not scores:
        return {}

    df = pd.DataFrame({"ticker": s.ticker, "score": s.score} for s in scores)

    # Determine breakpoints
    if large_cap_tickers:
        bp_df = df[df["ticker"].isin(large_cap_tickers)]
    else:
        bp_df = df

    if len(bp_df) < 5:
        bp_df = df  # fall back to full universe for breakpoints

    breakpoints = bp_df["score"].quantile([0.2, 0.4, 0.6, 0.8]).values

    def _quintile(score: float) -> int:
        if score <= breakpoints[0]:
            return 1
        elif score <= breakpoints[1]:
            return 2
        elif score <= breakpoints[2]:
            return 3
        elif score <= breakpoints[3]:
            return 4
        else:
            return 5

    return {row["ticker"]: _quintile(row["score"]) for _, row in df.iterrows()}


def build_portfolios(
    all_scores: dict[date, list[ScoredStock]],
    large_cap_tickers: set[str] | None = None,
) -> list[Portfolio]:
    """Build quintile portfolios for each score date.

    Args:
        all_scores: Dict mapping score_date -> list of ScoredStock.
        large_cap_tickers: Optional set of tickers for NYSE breakpoint estimation.

    Returns:
        List of Portfolio objects (one per quintile per score date).
    """
    portfolios = []

    for score_date, scores in sorted(all_scores.items()):
        if not scores:
            continue

        quintile_map = assign_quintiles(scores, large_cap_tickers)
        formation_date = _add_one_month(score_date)

        # Group tickers by quintile
        quintile_tickers: dict[int, list[str]] = {q: [] for q in range(1, 6)}
        for ticker, q in quintile_map.items():
            quintile_tickers[q].append(ticker)

        for q in range(1, 6):
            tickers = quintile_tickers[q]
            if tickers:
                portfolios.append(Portfolio(
                    formation_date=formation_date,
                    score_date=score_date,
                    quintile=q,
                    tickers=tickers,
                ))

    return portfolios
