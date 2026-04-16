"""Historical daily OHLCV via yfinance, with derived price signals.

Returns a DataFrame indexed by date with columns:
  open, high, low, close, volume,
  week_change_pct, month_change_pct, ma_20, ma_50
"""
import logging

import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)


def fetch_prices(ticker: str, start: str, end: str) -> pd.DataFrame:
    """Download OHLCV and compute moving averages and change percentages.

    Parameters
    ----------
    ticker : str
        Stock ticker symbol (e.g. 'AAPL')
    start : str
        Start date in YYYY-MM-DD format
    end : str
        End date in YYYY-MM-DD format (inclusive — yfinance end is exclusive, so we add 1 day)

    Returns
    -------
    pd.DataFrame
        Daily OHLCV + derived signals, indexed by date. Empty if download fails.
    """
    try:
        raw = yf.download(ticker, start=start, end=end, auto_adjust=True, progress=False, multi_level_index=False)
    except Exception as exc:
        logger.error("price_fetcher: yfinance download failed for %s: %s", ticker, exc)
        return pd.DataFrame()

    if raw.empty:
        logger.warning("price_fetcher: no data for %s between %s and %s", ticker, start, end)
        return pd.DataFrame()

    df = raw.rename(columns=str.lower).copy()
    df.index.name = "date"

    # ── Derived signals ──────────────────────────────────────────────────────
    df["ma_20"] = df["close"].rolling(20, min_periods=1).mean()
    df["ma_50"] = df["close"].rolling(50, min_periods=1).mean()

    # Percentage change relative to N trading days ago
    df["week_change_pct"]  = df["close"].pct_change(periods=5)  * 100
    df["month_change_pct"] = df["close"].pct_change(periods=21) * 100

    return df[["open", "high", "low", "close", "volume",
               "ma_20", "ma_50", "week_change_pct", "month_change_pct"]]
