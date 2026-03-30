"""Fetch recent news articles from Tavily for a list of tickers."""
import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def _is_relevant(article: dict, ticker: str, company_name: str) -> bool:
    """Check if article actually mentions the ticker or exact company name."""
    text = (article.get("title", "") + " " + article.get("description", "")).lower()
    if ticker.lower() in text:
        return True
    if company_name.lower() != ticker.lower() and company_name.lower() in text:
        return True
    return False


def _search_one_ticker(ticker: str, company_name: str, limit: int, days: int = 3) -> list[dict]:
    """Synchronous Tavily search for a single ticker. Called via executor."""
    from app.core.config import settings
    from tavily import TavilyClient

    client = TavilyClient(api_key=settings.TAVILY_API_KEY)
    query = f"{company_name} {ticker} stock news"
    try:
        response = client.search(
            query=query,
            topic="news",
            days=days,
            max_results=limit * 2,
        )
        results = []
        for r in response.get("results", []):
            results.append(
                {
                    "ticker": ticker,
                    "title": r.get("title", ""),
                    "description": r.get("content", "") or "",
                    "published_utc": r.get("published_date", ""),
                    "url": r.get("url", ""),
                }
            )
        # Filter to articles that actually mention this company
        if ticker != "MACRO":
            results = [r for r in results if _is_relevant(r, ticker, company_name)]
        return results[:limit]
    except Exception as exc:
        logger.warning("Tavily news fetch failed for %s: %s", ticker, exc)
        return []


async def fetch_news(
    tickers: list[str],
    ticker_names: Optional[dict[str, str]] = None,
    limit_per_ticker: int = 5,
    days: int = 3,
) -> list[dict]:
    """Return a flat list of news dicts: {ticker, title, description, published_utc, url}.

    Fetches all tickers in parallel via asyncio.gather + thread executor.
    Returns [] if TAVILY_API_KEY is not set or tickers is empty.
    """
    from app.core.config import settings

    if not settings.TAVILY_API_KEY or not tickers:
        return []

    loop = asyncio.get_running_loop()

    async def fetch_one(ticker: str) -> list[dict]:
        name = (ticker_names or {}).get(ticker, ticker)
        return await loop.run_in_executor(
            None, _search_one_ticker, ticker, name, limit_per_ticker, days
        )

    results = await asyncio.gather(*[fetch_one(t) for t in tickers], return_exceptions=True)

    items: list[dict] = []
    for r in results:
        if isinstance(r, list):
            items.extend(r)

    return items
