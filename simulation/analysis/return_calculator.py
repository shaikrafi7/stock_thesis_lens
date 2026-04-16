"""Calculate forward returns for quintile portfolios.

Computes equal-weight and value-weight portfolio returns at 1m, 3m, 6m, 12m
horizons, plus long-short (Q5 - Q1) spread returns.
"""
import logging
from datetime import date
from dataclasses import dataclass, field
from pathlib import Path

import sys
from pathlib import Path as _Path

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# Ensure project root is on path for simulation.* imports
_PROJECT_ROOT = _Path(__file__).parent.parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from simulation.analysis.portfolio_builder import Portfolio

_PRICE_DIR = Path(__file__).parent.parent / "data" / "raw" / "prices"

# Cache
_price_cache: dict[str, pd.DataFrame] = {}

HORIZONS = [1, 3, 6, 12]  # months


def _load_prices(ticker: str) -> pd.DataFrame | None:
    if ticker not in _price_cache:
        path = _PRICE_DIR / f"{ticker}_prices.parquet"
        if not path.exists():
            _price_cache[ticker] = None
            return None
        df = pd.read_parquet(path)
        df.index = pd.to_datetime(df.index)
        _price_cache[ticker] = df
    return _price_cache[ticker]


_DELIST_RETURN = -1.0  # -100% assigned when no price found within max window
_MAX_FORWARD_DAYS = 5  # trading days to look ahead before treating as delisted


def _price_on_or_after(ticker: str, as_of: date) -> float | None:
    """Get closing price within _MAX_FORWARD_DAYS trading days of as_of.

    Returns None only if the ticker has no price data at all (missing file).
    If the ticker was delisted (no price within the window), returns the
    sentinel value -1.0 so the caller can assign a -100% delisting return.
    """
    df = _load_prices(ticker)
    if df is None or df.empty:
        return None
    cutoff = pd.Timestamp(as_of)
    max_cutoff = cutoff + pd.offsets.BDay(_MAX_FORWARD_DAYS)
    available = df[(df.index >= cutoff) & (df.index <= max_cutoff)]
    if available.empty:
        logger.warning("No price for %s within %d trading days of %s — treating as delisted (-100%%)",
                       ticker, _MAX_FORWARD_DAYS, as_of)
        return _DELIST_RETURN
    return float(available.iloc[0]["close"])


def _price_on_or_before(ticker: str, as_of: date) -> float | None:
    """Get closing price on or immediately before as_of."""
    df = _load_prices(ticker)
    if df is None or df.empty:
        return None
    cutoff = pd.Timestamp(as_of)
    available = df[df.index <= cutoff]
    if available.empty:
        return None
    return float(available.iloc[-1]["close"])


def _add_months(d: date, months: int) -> date:
    """Add N months to a date, landing on the last business day of that month."""
    target_month = d.month + months
    target_year = d.year + (target_month - 1) // 12
    target_month = (target_month - 1) % 12 + 1
    # Use BMonthEnd so the return date aligns with a trading day, not a weekend
    # or holiday (calendar MonthEnd can land on a non-trading day).
    end = pd.Timestamp(year=target_year, month=target_month, day=1) + pd.offsets.BMonthEnd(0)
    return end.date()


def ticker_forward_return(ticker: str, start: date, end: date) -> float | None:
    """Compute simple return for a ticker from start to end date.

    Uses simple returns (p_end/p_start - 1) for cross-sectional averaging so
    that the equal-weight portfolio return equals the arithmetic mean of
    constituent returns.  Log returns are NOT additively correct cross-sectionally
    (arithmetic mean of log returns != log return of equal-weight portfolio).

    Returns -1.0 if the ticker was delisted before the end date (survivorship
    bias correction).  Returns None only if price data is entirely missing.
    """
    p_start = _price_on_or_after(ticker, start)
    if p_start is None:
        return None
    # Delisting: _price_on_or_after returns _DELIST_RETURN sentinel
    if p_start == _DELIST_RETURN:
        return -1.0
    if p_start <= 0:
        return None
    p_end = _price_on_or_before(ticker, end)
    if p_end is None or p_end <= 0:
        return None
    return p_end / p_start - 1


@dataclass
class PortfolioReturn:
    formation_date: date
    score_date: date
    quintile: int
    horizon_months: int
    equal_weight_return: float | None
    value_weight_return: float | None  # placeholder — requires market caps
    n_stocks: int


@dataclass
class QuintileReturns:
    """All portfolio returns across horizons, ready for analysis."""
    records: list[PortfolioReturn] = field(default_factory=list)

    def to_dataframe(self) -> pd.DataFrame:
        return pd.DataFrame([
            {
                "formation_date": r.formation_date,
                "score_date": r.score_date,
                "quintile": r.quintile,
                "horizon_months": r.horizon_months,
                "ew_return": r.equal_weight_return,
                "vw_return": r.value_weight_return,
                "n_stocks": r.n_stocks,
            }
            for r in self.records
        ])


def calculate_portfolio_returns(portfolios: list[Portfolio]) -> QuintileReturns:
    """Calculate forward returns for all portfolios at all horizons.

    Uses equal-weight returns (value-weight requires market cap data).
    """
    result = QuintileReturns()

    for portfolio in portfolios:
        start = portfolio.formation_date

        for h in HORIZONS:
            end = _add_months(start, h)

            returns = []
            missing = 0
            for ticker in portfolio.tickers:
                r = ticker_forward_return(ticker, start, end)
                if r is not None:
                    returns.append(r)
                else:
                    missing += 1

            if missing:
                logger.warning(
                    "Q%d %s h=%dm: %d/%d tickers excluded (no price data)",
                    portfolio.quintile, start, h, missing, len(portfolio.tickers),
                )

            ew_ret = float(np.mean(returns)) if returns else None

            result.records.append(PortfolioReturn(
                formation_date=portfolio.formation_date,
                score_date=portfolio.score_date,
                quintile=portfolio.quintile,
                horizon_months=h,
                equal_weight_return=ew_ret,
                value_weight_return=None,  # requires market cap data
                n_stocks=len(returns),
            ))

    return result


def build_longshort_series(qr: QuintileReturns) -> dict[int, pd.Series]:
    """Build monthly Q5-Q1 long-short return series per horizon.

    Returns dict mapping horizon_months -> pd.Series indexed by formation_date.
    """
    df = qr.to_dataframe()
    ls_by_horizon: dict[int, pd.Series] = {}

    for h in HORIZONS:
        sub = df[df["horizon_months"] == h]
        q5 = sub[sub["quintile"] == 5].set_index("formation_date")["ew_return"]
        q1 = sub[sub["quintile"] == 1].set_index("formation_date")["ew_return"]
        common = q5.index.intersection(q1.index)
        if common.empty:
            continue
        ls_series = q5.loc[common] - q1.loc[common]
        ls_by_horizon[h] = ls_series.sort_index()

    return ls_by_horizon
