"""Build production signal dataclasses from historical parquet data.

For any (ticker, date) pair, returns a CollectedSignals object using only
data that would have been available at that point in time (no look-ahead).
"""
import sys
from pathlib import Path
from datetime import date, timedelta

import numpy as np
import pandas as pd

# Add backend and project root to sys.path
_SIM_DIR = Path(__file__).parent.parent
_BACKEND = _SIM_DIR.parent / "backend"
_PROJECT_ROOT = _SIM_DIR.parent
for _p in [str(_BACKEND), str(_PROJECT_ROOT)]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

from app.agents.signal_collector import (
    CollectedSignals,
    PriceSignal,
    ValuationSignal,
    FinancialHealthSignal,
    OwnershipSignal,
    FundamentalSignal,
)

_DATA_DIR = Path(__file__).parent.parent / "data" / "raw"
_PRICE_DIR = _DATA_DIR / "prices"
_FUND_DIR = _DATA_DIR / "fundamentals"

# Cache loaded parquets to avoid re-reading on each call
_price_cache: dict[str, pd.DataFrame] = {}
_fund_cache: dict[str, pd.DataFrame] = {}


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


def _load_fundamentals(ticker: str) -> pd.DataFrame | None:
    if ticker not in _fund_cache:
        path = _FUND_DIR / f"{ticker}_fundamentals.parquet"
        if not path.exists():
            _fund_cache[ticker] = None
            return None
        df = pd.read_parquet(path)
        df.index = pd.to_datetime(df.index)
        _fund_cache[ticker] = df
    return _fund_cache[ticker]


def _get_price_row(ticker: str, as_of: date) -> pd.Series | None:
    """Get the most recent price row on or before as_of."""
    df = _load_prices(ticker)
    if df is None or df.empty:
        return None
    cutoff = pd.Timestamp(as_of)
    available = df[df.index <= cutoff]
    if available.empty:
        return None
    return available.iloc[-1]


def _get_fund_row(ticker: str, as_of: date) -> pd.Series | None:
    """Get the most recent fundamentals row on or before as_of (point-in-time)."""
    df = _load_fundamentals(ticker)
    if df is None or df.empty:
        return None
    cutoff = pd.Timestamp(as_of)
    available = df[df.index <= cutoff]
    if available.empty:
        return None
    return available.iloc[-1]


def _nan_to_none(val) -> float | None:
    if val is None:
        return None
    try:
        if np.isnan(val):
            return None
    except (TypeError, ValueError):
        pass
    return float(val)


def build_price_signal(ticker: str, as_of: date) -> PriceSignal | None:
    """Build PriceSignal from historical price parquet as of a given date."""
    df = _load_prices(ticker)
    if df is None or df.empty:
        return None

    cutoff = pd.Timestamp(as_of)
    available = df[df.index <= cutoff]
    if len(available) < 2:
        return None

    row = available.iloc[-1]
    prev_row = available.iloc[-2]

    current_price = float(row["close"])
    prev_close = float(prev_row["close"])
    day_change_pct = (current_price - prev_close) / prev_close * 100 if prev_close else 0.0

    # 52-week window
    one_year_ago = cutoff - pd.DateOffset(years=1)
    year_window = available[available.index >= one_year_ago]
    fifty_two_week_high = float(year_window["high"].max()) if not year_window.empty else current_price
    fifty_two_week_low = float(year_window["low"].min()) if not year_window.empty else current_price

    # Volume: use last 10 trading days for avg
    recent_10 = available.tail(10)
    avg_volume = float(recent_10["volume"].mean()) if len(recent_10) > 0 else float(row["volume"])
    current_volume = float(row["volume"])
    volume_ratio = current_volume / avg_volume if avg_volume > 0 else 1.0

    # BUG 7 FIX: `_nan_to_none(val) or default` treats 0.0 as falsy, replacing
    # legitimate zero values with the default.  Use explicit None checks instead.
    ma_20 = _nan_to_none(row.get("ma_20"))
    if ma_20 is None:
        ma_20 = current_price
    ma_50 = _nan_to_none(row.get("ma_50"))
    if ma_50 is None:
        ma_50 = current_price
    week_change_pct = _nan_to_none(row.get("week_change_pct"))
    if week_change_pct is None:
        week_change_pct = 0.0
    month_change_pct = _nan_to_none(row.get("month_change_pct"))
    if month_change_pct is None:
        month_change_pct = 0.0

    # BUG 6 FIX: Use ±2% band to match production signal_collector.py exactly.
    # Simulation previously used ±1%, causing trend label mismatches vs production.
    if ma_20 > ma_50 * 1.02:
        trend = "up"
    elif ma_20 < ma_50 * 0.98:
        trend = "down"
    else:
        trend = "flat"

    return PriceSignal(
        ticker=ticker,
        current_price=current_price,
        prev_close=prev_close,
        day_change_pct=day_change_pct,
        week_change_pct=week_change_pct,
        month_change_pct=month_change_pct,
        fifty_two_week_high=fifty_two_week_high,
        fifty_two_week_low=fifty_two_week_low,
        avg_volume_10d=avg_volume,
        current_volume=current_volume,
        volume_ratio=volume_ratio,
        ma_20=ma_20,
        ma_50=ma_50,
        trend=trend,
        available=True,
    )


def build_valuation_signal(ticker: str, as_of: date) -> ValuationSignal | None:
    """Build ValuationSignal from historical fundamentals parquet as of a given date."""
    row = _get_fund_row(ticker, as_of)
    if row is None:
        return None

    price_row = _get_price_row(ticker, as_of)
    current_price = float(price_row["close"]) if price_row is not None else None

    return ValuationSignal(
        trailing_pe=_nan_to_none(row.get("pe_ratio")),
        forward_pe=None,
        peg_ratio=_nan_to_none(row.get("peg_ratio")),
        ps_ratio=None,
        pb_ratio=_nan_to_none(row.get("price_to_book")),
        ev_ebitda=_nan_to_none(row.get("ev_to_ebitda")),
        analyst_target=None,
        current_price=current_price,
    )


def build_financial_health_signal(ticker: str, as_of: date) -> FinancialHealthSignal | None:
    """Build FinancialHealthSignal from historical fundamentals parquet as of a given date."""
    row = _get_fund_row(ticker, as_of)
    if row is None:
        return None

    return FinancialHealthSignal(
        debt_to_equity=_nan_to_none(row.get("debt_to_equity")),
        current_ratio=_nan_to_none(row.get("current_ratio")),
        roe=_nan_to_none(row.get("roe")),
        gross_margin=_nan_to_none(row.get("gross_margin")),
        operating_margin=_nan_to_none(row.get("operating_margin")),
        profit_margin=None,
        fcf=None,
        total_cash=None,
        total_debt=None,
        revenue=None,
        revenue_growth=_nan_to_none(row.get("revenue_growth")),
    )


def build_fundamental_signal(ticker: str, as_of: date) -> FundamentalSignal | None:
    """Build FundamentalSignal (EPS data) from historical fundamentals parquet."""
    row = _get_fund_row(ticker, as_of)
    if row is None:
        return None

    eps_actual = _nan_to_none(row.get("eps_actual"))
    eps_estimate = _nan_to_none(row.get("eps_estimate"))

    surprise_pct = None
    eps_beat = None
    if eps_actual is not None and eps_estimate is not None and eps_estimate != 0:
        surprise_pct = (eps_actual - eps_estimate) / abs(eps_estimate) * 100
        eps_beat = eps_actual >= eps_estimate

    return FundamentalSignal(
        pe_ratio=_nan_to_none(row.get("pe_ratio")),
        revenue_growth=_nan_to_none(row.get("revenue_growth")),
        gross_profit_margin=_nan_to_none(row.get("gross_margin")),
        eps_actual=eps_actual,
        eps_estimate=eps_estimate,
        surprise_pct=surprise_pct,
        eps_beat=eps_beat,
    )


def build_signals(ticker: str, as_of: date) -> CollectedSignals:
    """Build full CollectedSignals for a ticker at a given historical date.

    Uses only data available at or before as_of — no look-ahead bias.
    Ownership and insider signals are omitted (not in parquet data).
    """
    price_signal = build_price_signal(ticker, as_of)
    valuation_signal = build_valuation_signal(ticker, as_of)
    fin_signal = build_financial_health_signal(ticker, as_of)
    fund_signal = build_fundamental_signal(ticker, as_of)

    return CollectedSignals(
        ticker=ticker,
        price=price_signal,
        news=[],
        fundamentals=fund_signal,
        insider_transactions=[],
        recent_filings=[],
        valuation=valuation_signal,
        financial_health=fin_signal,
        ownership=None,
    )
