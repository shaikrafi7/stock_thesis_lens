"""Fetch recent news articles from Polygon.io for a list of tickers."""
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


def _fetch_polygon_news(ticker: str, limit: int, days: int = 3) -> list[dict]:
    """Fetch news for a single ticker from Polygon.io reference/news endpoint."""
    from app.core.config import settings

    if not settings.POLYGON_API_KEY:
        return []

    since = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%dT00:00:00Z")
    params = {
        "apiKey": settings.POLYGON_API_KEY,
        "limit": limit,
        "published_utc.gte": since,
        "order": "desc",
        "sort": "published_utc",
    }
    if ticker != "MACRO":
        params["ticker"] = ticker

    try:
        resp = httpx.get(
            "https://api.polygon.io/v2/reference/news",
            params=params,
            timeout=15,
            follow_redirects=True,
        )
        resp.raise_for_status()
        data = resp.json()

        results = []
        for article in data.get("results", []):
            # For macro queries without a ticker filter, include all results
            # For ticker queries, Polygon already filters by ticker
            results.append({
                "ticker": ticker,
                "title": article.get("title", ""),
                "description": article.get("description", "") or "",
                "published_utc": article.get("published_utc", ""),
                "url": article.get("article_url", ""),
            })
        return results[:limit]
    except Exception as exc:
        logger.warning("Polygon news fetch failed for %s: %s", ticker, exc)
        return []


async def fetch_news(
    tickers: list[str],
    ticker_names: Optional[dict[str, str]] = None,
    limit_per_ticker: int = 5,
    days: int = 3,
) -> list[dict]:
    """Return a flat list of news dicts: {ticker, title, description, published_utc, url}.

    Fetches tickers sequentially with a small delay to respect Polygon rate limits.
    """
    from app.core.config import settings

    if not settings.POLYGON_API_KEY or not tickers:
        return []

    loop = asyncio.get_running_loop()
    items: list[dict] = []

    for ticker in tickers:
        try:
            result = await loop.run_in_executor(
                None, _fetch_polygon_news, ticker, limit_per_ticker, days
            )
            if isinstance(result, list):
                items.extend(result)
        except Exception as exc:
            logger.warning("fetch_news: %s failed: %s", ticker, exc)
        # Small delay between requests to avoid 429s on free-tier Polygon
        if ticker != tickers[-1]:
            await asyncio.sleep(0.3)

    return items
