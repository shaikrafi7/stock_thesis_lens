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
