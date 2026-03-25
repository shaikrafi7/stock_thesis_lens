import json
import logging
from dataclasses import dataclass, field
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

CATEGORIES = [
    "competitive_moat", "growth_trajectory", "valuation",
    "financial_health", "ownership_conviction", "risks",
]

SYSTEM_PROMPT = """You are a financial research assistant generating a morning portfolio briefing for a long-term retail investor.

You receive:
1. The investor's current portfolio with thesis points and evaluation scores
2. Recent news headlines for each stock

Your task:
- Write a 1–2 sentence overall summary of what matters most today across the portfolio
- For each significant news item, assess whether it is bullish, bearish, or neutral for the investor's thesis
- When a news item clearly supports or challenges an existing thesis, or reveals a new thesis point, include a specific thesis suggestion

Rules:
- Only include news items that are genuinely relevant (skip press releases, minor events)
- Maximum 6 items total across all stocks
- Be concise and investor-focused (not journalistic)
- No buy/sell recommendations
- The suggestion statement must provide ANALYTICAL INSIGHT beyond the headline — frame it as what this means for the investor's thesis, not a restatement of the news. Bad: "Company X reported strong earnings." Good: "Earnings beat confirms pricing power thesis with 200bps margin expansion."
- If you cannot add genuine insight beyond the headline, set suggestion to null
- Each news item has a source_url — pass it through unchanged in your response

You MUST respond with valid JSON in this exact format:

{
  "summary": "1-2 sentence portfolio overview for today",
  "items": [
    {
      "ticker": "AAPL",
      "headline": "short version of the headline",
      "impact": "bullish",
      "source_url": "https://example.com/article",
      "suggestion": null
    },
    {
      "ticker": "NVDA",
      "headline": "short version of the headline",
      "impact": "bearish",
      "source_url": "https://example.com/article2",
      "suggestion": {
        "category": "one of: competitive_moat, growth_trajectory, valuation, financial_health, ownership_conviction, risks",
        "statement": "A complete sentence under 25 words written from a buyer's investment perspective"
      }
    }
  ]
}

impact must be one of: bullish, bearish, neutral
source_url: pass through the URL from the news item you are summarizing
suggestion is null unless you have a specific, well-formed thesis point to propose."""


@dataclass
class BriefingItemResult:
    ticker: str
    headline: str
    impact: str
    suggestion: Optional[dict] = None  # {category, statement}
    source_url: Optional[str] = None


@dataclass
class MorningBriefingResult:
    summary: str
    items: list[BriefingItemResult] = field(default_factory=list)


def _build_context(portfolio_data: list[dict], news_items: list[dict]) -> str:
    lines = []

    # Portfolio section
    if portfolio_data:
        lines.append(f"Portfolio ({len(portfolio_data)} stocks):")
        for s in portfolio_data:
            ticker = s.get("ticker", "")
            name = s.get("name", ticker)
            score = s.get("score")
            theses = s.get("theses", [])
            selected = [t["statement"] for t in theses if t.get("selected")]

            score_str = f"Score {score:.0f}" if score is not None else "Not evaluated"
            lines.append(f"  {ticker} ({name}) — {score_str}")
            for stmt in selected[:3]:
                lines.append(f"    • {stmt}")
    else:
        lines.append("Portfolio: empty")

    lines.append("")

    # News section
    if news_items:
        lines.append("Recent news:")
        by_ticker: dict[str, list[dict]] = {}
        for item in news_items:
            by_ticker.setdefault(item["ticker"], []).append(item)
        for ticker, articles in by_ticker.items():
            for a in articles:
                title = a.get("title", "")
                desc = a.get("description", "")
                url = a.get("url", "")
                url_str = f" ({url})" if url else ""
                lines.append(f"  [{ticker}] {title}{url_str}")
                if desc:
                    lines.append(f"    {desc[:200]}")
    else:
        lines.append("No recent news available.")

    return "\n".join(lines)


def generate_briefing(portfolio_data: list[dict], news_items: list[dict]) -> MorningBriefingResult:
    if not settings.OPENAI_API_KEY:
        return MorningBriefingResult(summary="API key not configured — briefing unavailable.")

    if not news_items:
        return MorningBriefingResult(
            summary="No recent news found for your portfolio stocks.",
            items=[],
        )

    from openai import OpenAI

    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    context = _build_context(portfolio_data, news_items)

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Generate today's briefing based on this data:\n\n{context}"},
            ],
            temperature=0.3,
            max_tokens=900,
        )

        raw = response.choices[0].message.content or "{}"
        data = json.loads(raw)

        summary = data.get("summary", "No summary available.")
        raw_items = data.get("items", [])

        items: list[BriefingItemResult] = []
        for item in raw_items:
            ticker = item.get("ticker", "").upper()
            headline = item.get("headline", "")
            impact = item.get("impact", "neutral")
            if impact not in ("bullish", "bearish", "neutral"):
                impact = "neutral"

            suggestion = None
            s = item.get("suggestion")
            if isinstance(s, dict):
                cat = s.get("category", "")
                stmt = s.get("statement", "").strip()
                if cat in CATEGORIES and len(stmt) >= 10:
                    suggestion = {"category": cat, "statement": stmt}

            source_url = item.get("source_url", "") or ""

            if ticker and headline:
                items.append(BriefingItemResult(
                    ticker=ticker, headline=headline, impact=impact,
                    suggestion=suggestion, source_url=source_url or None,
                ))

        return MorningBriefingResult(summary=summary, items=items[:6])

    except Exception as exc:
        logger.error("morning_briefing_agent: error (%s)", exc)
        return MorningBriefingResult(summary="Unable to generate briefing — please try again later.")
