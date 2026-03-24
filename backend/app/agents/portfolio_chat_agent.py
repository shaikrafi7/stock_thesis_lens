import json
import logging
from dataclasses import dataclass
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

CATEGORIES = ["core_beliefs", "strengths", "risks", "leadership", "catalysts"]

SYSTEM_PROMPT = """You are a portfolio research assistant helping a long-term retail investor manage and analyse their stock portfolio.

Your role:
- Answer questions about the overall portfolio (coverage, risk concentration, sector balance, weakest/strongest holdings)
- Help the investor add or remove stocks from their portfolio
- Suggest specific thesis points for individual stocks when useful
- When asked about today's performance or what happened, use the live market data provided in the context

Rules:
- Be factual and balanced — cover bull and bear cases honestly
- No buy/sell recommendations or direct financial advice
- Focus on structural, durable factors for a 3–10 year time horizon
- Keep responses concise (3–5 sentences unless more detail is requested)
- When the user wants to add or remove a stock, confirm what you are about to do
- When market data is available, reference specific numbers (price, change%) to ground your analysis

You MUST always respond with valid JSON in this exact format:

{
  "message": "your response text here",
  "action": null
}

Or, if the user is asking to add a stock:

{
  "message": "your response text here",
  "action": { "type": "add_stock", "ticker": "MSFT" }
}

Or, if the user is asking to remove a stock:

{
  "message": "your response text here",
  "action": { "type": "delete_stock", "ticker": "TSLA" }
}

Or, if you want to propose a thesis point for a specific stock:

{
  "message": "your response text here",
  "action": {
    "type": "add_thesis",
    "ticker": "NVDA",
    "category": "one of: core_beliefs, strengths, risks, leadership, catalysts",
    "statement": "A complete sentence under 25 words, written from a long-term investor perspective"
  }
}

Always use uppercase tickers. Include an action whenever the user clearly requests one or when you identify a specific, well-formed thesis point worth adding."""


@dataclass
class PortfolioAction:
    type: str
    ticker: str
    category: Optional[str] = None
    statement: Optional[str] = None


@dataclass
class PortfolioChatResult:
    message: str
    action: Optional[PortfolioAction] = None


def _build_context(portfolio_data: list[dict]) -> str:
    if not portfolio_data:
        return "Portfolio: empty (no stocks added yet)"

    lines = [f"Portfolio ({len(portfolio_data)} stock{'s' if len(portfolio_data) != 1 else ''}):"]
    for s in portfolio_data:
        ticker = s.get("ticker", "")
        name = s.get("name", ticker)
        score = s.get("score")
        status = s.get("status", "")
        theses = s.get("theses", [])
        selected = [t for t in theses if t.get("selected")]
        price = s.get("price")
        change_pct = s.get("change_pct")

        if score is not None:
            status_label = {"green": "Strong", "yellow": "Pressure", "red": "At Risk"}.get(status, status)
            score_str = f"Score: {score:.0f} ({status_label})"
        else:
            score_str = "Not evaluated"

        price_str = ""
        if price is not None:
            price_str = f"${price:.2f}"
            if change_pct is not None:
                direction = "+" if change_pct >= 0 else ""
                price_str += f" ({direction}{change_pct:.2f}%)"

        parts = [f"  {ticker:<6} {name:<30}"]
        if price_str:
            parts.append(f" | {price_str:<20}")
        parts.append(f" | {score_str:<25} | {len(selected)}/{len(theses)} thesis pts")
        lines.append("".join(parts))

    return "\n".join(lines)


def chat(portfolio_data: list[dict], messages: list[dict]) -> PortfolioChatResult:
    if not settings.OPENAI_API_KEY:
        return PortfolioChatResult(message="OpenAI API key not configured.")

    from openai import OpenAI

    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    context = _build_context(portfolio_data)
    system_content = f"{SYSTEM_PROMPT}\n\nContext:\n{context}"

    openai_messages = [{"role": "system", "content": system_content}]
    openai_messages.extend(messages)

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            messages=openai_messages,
            temperature=0.4,
            max_tokens=600,
        )

        raw = response.choices[0].message.content or "{}"
        data = json.loads(raw)

        message_text = data.get("message", "")
        action_data = data.get("action")

        action: Optional[PortfolioAction] = None
        if isinstance(action_data, dict):
            action_type = action_data.get("type", "")
            ticker = action_data.get("ticker", "").upper().strip()
            if action_type in ("add_stock", "delete_stock") and ticker:
                action = PortfolioAction(type=action_type, ticker=ticker)
            elif action_type == "add_thesis":
                cat = action_data.get("category", "")
                stmt = action_data.get("statement", "").strip()
                if ticker and cat in CATEGORIES and len(stmt) >= 10:
                    action = PortfolioAction(type=action_type, ticker=ticker, category=cat, statement=stmt)

        return PortfolioChatResult(message=message_text, action=action)

    except Exception as exc:
        logger.error("portfolio_chat_agent: error (%s)", exc)
        return PortfolioChatResult(message="Sorry, I encountered an error. Please try again.")
