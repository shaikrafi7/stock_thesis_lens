"""FMP API client with rate limiting and SQLite caching.

FMP Starter plan: 300 calls/minute. We cap at 250.
New base URL (post-Aug 2025): https://financialmodelingprep.com/stable/

Notes on endpoint availability at Starter tier:
  - period=quarter is NOT available for key-metrics, ratios, analyst-estimates
  - balance-sheet and income-statement DO support period=quarter
  - Use TTM / annual variants where quarterly is gated
"""
import logging
import time
from pathlib import Path

import httpx
import pandas as pd

from simulation.config import FMP_API_KEY, FMP_MAX_CALLS_PER_MIN, CACHE_PATH
from simulation.data.cache import Cache

logger = logging.getLogger(__name__)

_BASE = "https://financialmodelingprep.com/stable"


class FMPClient:
    """Rate-limited FMP client with caching."""

    def __init__(self, api_key: str = FMP_API_KEY, cache_path: Path = CACHE_PATH) -> None:
        if not api_key:
            raise ValueError("FMP_API_KEY is not set. Add it to your .env file.")
        self._key = api_key
        self._cache = Cache(cache_path)
        self._call_times: list[float] = []

    def _throttle(self) -> None:
        """Block until we are within FMP_MAX_CALLS_PER_MIN in the last 60s."""
        now = time.monotonic()
        self._call_times = [t for t in self._call_times if now - t < 60.0]
        if len(self._call_times) >= FMP_MAX_CALLS_PER_MIN:
            sleep_for = 60.0 - (now - self._call_times[0]) + 0.1
            logger.debug("FMP rate limit: sleeping %.1fs", sleep_for)
            time.sleep(max(sleep_for, 0))
        self._call_times.append(time.monotonic())

    def _get(self, path: str, params: dict) -> list | dict:
        self._throttle()
        params["apikey"] = self._key
        resp = httpx.get(f"{_BASE}/{path}", params=params, timeout=15, follow_redirects=True)
        resp.raise_for_status()
        return resp.json()

    def _fetch(self, ticker: str, endpoint: str, params: dict, cache_key: str) -> list | dict | None:
        """Generic fetch with cache check."""
        cached = self._cache.get(ticker, cache_key, "latest")
        if cached is not None:
            return cached
        try:
            data = self._get(endpoint, {"symbol": ticker, **params})
        except Exception as exc:
            logger.error("FMP [%s %s]: %s", endpoint, ticker, exc)
            return None
        self._cache.set(ticker, cache_key, "latest", data)
        return data

    # ── Endpoint methods ──────────────────────────────────────────────────────

    def income_statements(self, ticker: str, limit: int = 20) -> pd.DataFrame:
        """Quarterly income statements."""
        data = self._fetch(ticker, "income-statement",
                           {"period": "quarter", "limit": limit}, "income_quarter")
        return _to_df(data)

    def balance_sheets(self, ticker: str, limit: int = 20) -> pd.DataFrame:
        """Quarterly balance sheets."""
        data = self._fetch(ticker, "balance-sheet-statement",
                           {"period": "quarter", "limit": limit}, "balance_quarter")
        return _to_df(data)

    def key_metrics(self, ticker: str, limit: int = 20) -> pd.DataFrame:
        """Annual key metrics (quarterly not available at Starter tier)."""
        data = self._fetch(ticker, "key-metrics",
                           {"limit": limit}, "key_metrics_annual")
        return _to_df(data)

    def ratios(self, ticker: str, limit: int = 20) -> pd.DataFrame:
        """Annual ratios (quarterly not available at Starter tier)."""
        data = self._fetch(ticker, "ratios",
                           {"limit": limit}, "ratios_annual")
        return _to_df(data)

    def ratios_ttm(self, ticker: str) -> pd.DataFrame:
        """TTM ratios — single row with trailing-twelve-month values."""
        data = self._fetch(ticker, "ratios-ttm", {}, "ratios_ttm")
        if not data:
            return pd.DataFrame()
        rows = data if isinstance(data, list) else [data]
        return pd.DataFrame(rows)

    def enterprise_values(self, ticker: str, limit: int = 20) -> pd.DataFrame:
        """Annual enterprise values."""
        data = self._fetch(ticker, "enterprise-values",
                           {"limit": limit}, "ev_annual")
        return _to_df(data)

    def earnings(self, ticker: str, limit: int = 20) -> pd.DataFrame:
        """Quarterly earnings history: eps_actual, eps_estimate."""
        data = self._fetch(ticker, "earnings",
                           {"limit": limit}, "earnings")
        return _to_df(data)

    def analyst_estimates(self, ticker: str, limit: int = 20) -> pd.DataFrame:
        """Annual analyst estimates (quarterly gated on Starter)."""
        data = self._fetch(ticker, "analyst-estimates",
                           {"period": "annual", "limit": limit}, "analyst_estimates_annual")
        return _to_df(data)

    def close(self) -> None:
        self._cache.close()


def _to_df(data: list | dict | None) -> pd.DataFrame:
    """Convert FMP response to DataFrame indexed by filing/accepted date."""
    if not data:
        return pd.DataFrame()
    rows = data if isinstance(data, list) else [data]
    df = pd.DataFrame(rows)
    # Prefer filingDate for point-in-time correctness, fall back to date
    if "filingDate" in df.columns:
        df.index = pd.to_datetime(df["filingDate"])
    elif "date" in df.columns:
        df.index = pd.to_datetime(df["date"])
    df.index.name = "date"
    return df.sort_index()
