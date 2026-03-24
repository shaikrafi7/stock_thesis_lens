"""Financial Datasets API utilities."""
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_BASE = "https://api.financialdatasets.ai"


def get_earnings(ticker: str) -> dict:
    """Fetch latest earnings data. Returns {} on any error."""
    if not settings.FINANCIAL_DATASETS_API_KEY:
        return {}
    try:
        resp = httpx.get(
            f"{_BASE}/earnings",
            params={"ticker": ticker, "limit": 2},
            headers={"X-API-KEY": settings.FINANCIAL_DATASETS_API_KEY},
            timeout=8,
        )
        resp.raise_for_status()
        data = resp.json()
        earnings_list = data.get("earnings", [])
        if not earnings_list:
            return {}
        latest = earnings_list[0]
        eps_actual = latest.get("eps_actual")
        eps_estimate = latest.get("eps_estimated")
        revenue_actual = latest.get("revenue")
        revenue_estimate = latest.get("revenue_estimated")

        surprise_pct = None
        if eps_actual is not None and eps_estimate is not None and eps_estimate != 0:
            surprise_pct = round((eps_actual - eps_estimate) / abs(eps_estimate) * 100, 2)

        return {
            "eps_actual": eps_actual,
            "eps_estimate": eps_estimate,
            "surprise_pct": surprise_pct,
            "eps_beat": (surprise_pct > 0) if surprise_pct is not None else None,
            "revenue_actual": revenue_actual,
            "revenue_estimate": revenue_estimate,
            "period": latest.get("period"),
        }
    except Exception as exc:
        logger.warning("financial_datasets: get_earnings failed for %s: %s", ticker, exc)
        return {}
