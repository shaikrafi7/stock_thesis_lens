"""Market regime classification for each month-end date.

Regimes (non-mutually-exclusive labels applied per month):

  trend:     bull   (SPY trailing 6m return > +10%)
             bear   (SPY trailing 6m return < -10%)
             flat   (between -10% and +10%)

  vol:       high   (30-day realized vol annualized > 25%)
             low    (<= 25%)

  style:     growth (IWF 6m return > IWD 6m return)
             value  (IWD >= IWF)

Sources: SPY (market), IWF (Russell 1000 Growth), IWD (Russell 1000 Value).
"""
from datetime import date
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

_PRICE_DIR = Path(__file__).parent.parent / "data" / "raw" / "prices"


@dataclass
class Regime:
    date: date
    trend: str       # "bull", "bear", "flat"
    vol: str         # "high", "low"
    style: str       # "growth", "value"
    spy_6m_ret: float
    realized_vol: float
    iwf_6m_ret: float
    iwd_6m_ret: float


def _load(ticker: str) -> pd.Series:
    """Load closing prices as a Series indexed by date."""
    path = _PRICE_DIR / f"{ticker}_prices.parquet"
    df = pd.read_parquet(path)
    df.index = pd.to_datetime(df.index)
    # Handle both flat and MultiIndex columns
    if "Close" in df.columns:
        return df["Close"].squeeze()
    if "close" in df.columns:
        return df["close"].squeeze()
    return df.iloc[:, 0].squeeze()


def classify_regimes(dates: list[date]) -> dict[date, Regime]:
    """Classify market regime for each date in the list."""
    spy = _load("SPY")
    iwf = _load("IWF")
    iwd = _load("IWD")

    result: dict[date, Regime] = {}

    for d in dates:
        ts = pd.Timestamp(d)

        # 6-month trailing return for SPY
        ts_6m_ago = ts - pd.DateOffset(months=6)
        spy_recent = spy[spy.index <= ts]
        spy_past = spy[spy.index <= ts_6m_ago]
        if spy_recent.empty or spy_past.empty:
            continue
        spy_6m_ret = float(spy_recent.iloc[-1] / spy_past.iloc[-1] - 1)

        # Trend classification
        if spy_6m_ret > 0.10:
            trend = "bull"
        elif spy_6m_ret < -0.10:
            trend = "bear"
        else:
            trend = "flat"

        # 30-day realized volatility (annualized)
        spy_30d = spy[(spy.index <= ts) & (spy.index > ts - pd.DateOffset(days=45))]
        if len(spy_30d) >= 10:
            daily_ret = spy_30d.pct_change().dropna()
            realized_vol = float(daily_ret.std() * np.sqrt(252))
        else:
            realized_vol = 0.0
        vol = "high" if realized_vol > 0.25 else "low"

        # Style: growth vs value (IWF vs IWD 6m return)
        iwf_recent = iwf[iwf.index <= ts]
        iwf_past = iwf[iwf.index <= ts_6m_ago]
        iwd_recent = iwd[iwd.index <= ts]
        iwd_past = iwd[iwd.index <= ts_6m_ago]
        if iwf_recent.empty or iwf_past.empty or iwd_recent.empty or iwd_past.empty:
            continue
        iwf_6m = float(iwf_recent.iloc[-1] / iwf_past.iloc[-1] - 1)
        iwd_6m = float(iwd_recent.iloc[-1] / iwd_past.iloc[-1] - 1)
        style = "growth" if iwf_6m > iwd_6m else "value"

        result[d] = Regime(
            date=d, trend=trend, vol=vol, style=style,
            spy_6m_ret=spy_6m_ret, realized_vol=realized_vol,
            iwf_6m_ret=iwf_6m, iwd_6m_ret=iwd_6m,
        )

    return result
