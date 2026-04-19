"""Financial Modeling Prep (FMP) API utilities."""
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_BASE = "https://financialmodelingprep.com/api/v3"


def get_company_profile(ticker: str) -> dict:
    """Fetch company profile from FMP. Returns {} on any error."""
    if not settings.FMP_API_KEY:
        return {}
    try:
        resp = httpx.get(
            f"{_BASE}/profile/{ticker}",
            params={"apikey": settings.FMP_API_KEY},
            timeout=8,
            follow_redirects=True,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data:
            return {}
        p = data[0]
        return {
            "name": p.get("companyName", ""),
            "sector": p.get("sector", ""),
            "industry": p.get("industry", ""),
            "description": p.get("description", ""),
            "mkt_cap": p.get("mktCap", ""),
            "ceo": p.get("ceo", ""),
            "website": p.get("website", ""),
        }
    except Exception as exc:
        logger.warning("fmp: get_company_profile failed for %s: %s", ticker, exc)
        return {}


def get_fundamentals(ticker: str) -> dict:
    """Fetch key financial metrics from FMP. Returns {} on any error."""
    if not settings.FMP_API_KEY:
        return {}
    try:
        resp = httpx.get(
            f"{_BASE}/key-metrics/{ticker}",
            params={"limit": 1, "period": "quarter", "apikey": settings.FMP_API_KEY},
            timeout=8,
            follow_redirects=True,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data:
            return {}
        m = data[0]
        return {
            "pe_ratio": m.get("peRatio"),
            "revenue_per_share": m.get("revenuePerShare"),
            "net_income_per_share": m.get("netIncomePerShare"),
            "gross_profit_margin": m.get("grossProfitMargin"),
            "revenue_growth": m.get("revenueGrowth"),
        }
    except Exception as exc:
        logger.warning("fmp: get_fundamentals failed for %s: %s", ticker, exc)
        return {}


def get_quarterly_income(ticker: str, limit: int = 8) -> list[dict]:
    """Fetch recent quarterly income statements. Returns [] on any error.

    Used for computing trend labels (revenue, margins) across multiple quarters.
    Results are ordered newest first.
    """
    if not settings.FMP_API_KEY:
        return []
    try:
        resp = httpx.get(
            f"{_BASE}/income-statement/{ticker}",
            params={"limit": limit, "period": "quarter", "apikey": settings.FMP_API_KEY},
            timeout=10,
            follow_redirects=True,
        )
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, list):
            return []
        return data
    except Exception as exc:
        logger.warning("fmp: get_quarterly_income failed for %s: %s", ticker, exc)
        return []


def get_quarterly_balance(ticker: str, limit: int = 8) -> list[dict]:
    """Fetch recent quarterly balance sheets. Newest first. Returns [] on any error."""
    if not settings.FMP_API_KEY:
        return []
    try:
        resp = httpx.get(
            f"{_BASE}/balance-sheet-statement/{ticker}",
            params={"limit": limit, "period": "quarter", "apikey": settings.FMP_API_KEY},
            timeout=10,
            follow_redirects=True,
        )
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, list):
            return []
        return data
    except Exception as exc:
        logger.warning("fmp: get_quarterly_balance failed for %s: %s", ticker, exc)
        return []
