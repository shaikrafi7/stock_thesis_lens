import json
import logging
from collections.abc import Generator
from dataclasses import dataclass
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

CATEGORIES = [
    "competitive_moat", "growth_trajectory", "valuation",
    "financial_health", "ownership_conviction", "risks",
]

SYSTEM_PROMPT = """You are a portfolio research assistant helping a long-term retail investor manage and analyse their stock portfolio from the BUYER'S PERSPECTIVE.

Your role:
- Answer questions about the overall portfolio (coverage, risk concentration, sector balance, weakest/strongest holdings)
- Help the investor add or remove stocks from their portfolio
- Suggest specific thesis points for individual stocks when useful
- When asked about today's performance or what happened, use the live market data provided in the context

Rules:
- Be factual and balanced — cover bull and bear cases honestly
- No buy/sell recommendations or direct financial advice
- Focus on structural, durable factors for a 1+ year time horizon
- Keep responses concise (3–5 sentences unless more detail is requested)
- When the user wants to add or remove a stock, confirm what you are about to do
- When market data is available, reference specific numbers (price, change%) to ground your analysis

You MUST always respond with valid JSON in this exact format:

{{
  "message": "your response text here",
  "action": null
}}

Or, if the user is asking to add a stock:

{{
  "message": "your response text here",
  "action": {{ "type": "add_stock", "ticker": "MSFT" }}
}}

Or, if the user is asking to remove a stock:

{{
  "message": "your response text here",
  "action": {{ "type": "delete_stock", "ticker": "TSLA" }}
}}

Or, if you want to propose a thesis point for a specific stock:

{{
  "message": "your response text here",
  "action": {{
    "type": "add_thesis",
    "ticker": "NVDA",
    "category": "one of: competitive_moat, growth_trajectory, valuation, financial_health, ownership_conviction, risks",
    "statement": "A complete sentence under 25 words, written from a buyer's investment perspective"
  }}
}}

Always use uppercase tickers. Include an action whenever the user clearly requests one or when you identify a specific, well-formed thesis point worth adding."""


def _build_investor_profile_block(investor_profile: dict | None) -> str:
    if not investor_profile:
        return ""
    parts = []
    archetype = investor_profile.get("archetype_label", "")
    style = investor_profile.get("investment_style", "")
    horizon = investor_profile.get("time_horizon", "")
    loss_av = investor_profile.get("loss_aversion", "")
    primary_bias = investor_profile.get("primary_bias", "")
    if archetype:
        parts.append(f"Archetype: {archetype}")
    if style:
        parts.append(f"Style: {style}")
    if horizon:
        parts.append(f"Time horizon: {horizon}")
    if loss_av:
        parts.append(f"Loss aversion: {loss_av}")
    if primary_bias and primary_bias != "none":
        parts.append(f"Primary bias: {primary_bias.replace('_', ' ')}")
    if not parts:
        return ""
    profile_str = " | ".join(parts)
    return (
        f"Investor Profile: {profile_str}\n"
        "Tailor suggestions to this investor's style. When relevant, reference their behavioral tendencies "
        "(e.g., 'Given your growth focus...' or 'Your high loss aversion may be influencing this view...').\n\n"
    )


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


def chat(portfolio_data: list[dict], messages: list[dict], investor_profile: dict | None = None) -> PortfolioChatResult:
    if not settings.OPENAI_API_KEY:
        return PortfolioChatResult(message="OpenAI API key not configured.")

    from openai import OpenAI

    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    context = _build_context(portfolio_data)
    profile_block = _build_investor_profile_block(investor_profile)
    system_content = f"{SYSTEM_PROMPT.format(investor_profile_block=profile_block)}\n\nContext:\n{context}"

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


# ── Streaming variant ─────────────────────────────────────────────────────

STREAM_SYSTEM_PROMPT = """You are a portfolio research assistant helping a long-term retail investor manage and analyse their stock portfolio from the BUYER'S PERSPECTIVE.

{investor_profile_block}
Your role:
- Answer questions about the overall portfolio (coverage, risk concentration, sector balance, weakest/strongest holdings)
- Help the investor add or remove stocks from their portfolio
- Suggest specific thesis points for individual stocks when useful
- When asked about today's performance or what happened, use the live market data provided in the context

Rules:
- Be factual and balanced — cover bull and bear cases honestly
- No buy/sell recommendations or direct financial advice
- Focus on structural, durable factors for a 1+ year time horizon
- Keep responses concise (3–5 sentences unless more detail is requested)
- When the user wants to add or remove a stock, confirm what you are about to do and use the appropriate tool
- When market data is available, reference specific numbers (price, change%) to ground your analysis

Categories: competitive_moat, growth_trajectory, valuation, financial_health, ownership_conviction, risks"""

PORTFOLIO_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "add_stock",
            "description": "Add a stock to the portfolio",
            "parameters": {
                "type": "object",
                "properties": {
                    "ticker": {"type": "string", "description": "The stock ticker symbol (uppercase)"},
                },
                "required": ["ticker"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_stock",
            "description": "Remove a stock from the portfolio",
            "parameters": {
                "type": "object",
                "properties": {
                    "ticker": {"type": "string", "description": "The stock ticker symbol (uppercase)"},
                },
                "required": ["ticker"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_thesis",
            "description": "Suggest a thesis point for a specific stock",
            "parameters": {
                "type": "object",
                "properties": {
                    "ticker": {"type": "string", "description": "The stock ticker symbol (uppercase)"},
                    "category": {
                        "type": "string",
                        "enum": CATEGORIES,
                        "description": "The thesis category",
                    },
                    "statement": {
                        "type": "string",
                        "description": "A complete sentence under 25 words, written from a long-term investor perspective",
                    },
                },
                "required": ["ticker", "category", "statement"],
            },
        },
    },
]


def chat_stream(
    portfolio_data: list[dict],
    messages: list[dict],
    investor_profile: dict | None = None,
) -> Generator[dict, None, None]:
    """Yield SSE event dicts: {"event": "token"|"action"|"done"|"error", "data": ...}"""
    if not settings.OPENAI_API_KEY:
        yield {"event": "error", "data": {"message": "OpenAI API key not configured."}}
        return

    from openai import OpenAI

    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    context = _build_context(portfolio_data)
    profile_block = _build_investor_profile_block(investor_profile)
    system_content = f"{STREAM_SYSTEM_PROMPT.format(investor_profile_block=profile_block)}\n\nContext:\n{context}"

    openai_messages = [{"role": "system", "content": system_content}]
    openai_messages.extend(messages)

    try:
        stream = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=openai_messages,
            tools=PORTFOLIO_TOOLS,
            temperature=0.4,
            max_tokens=600,
            stream=True,
        )

        tool_call_id = ""
        tool_call_name = ""
        tool_call_args = ""

        for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if not delta:
                continue

            if delta.content:
                yield {"event": "token", "data": {"content": delta.content}}

            if delta.tool_calls:
                for tc in delta.tool_calls:
                    if tc.id:
                        tool_call_id = tc.id
                    if tc.function:
                        if tc.function.name:
                            tool_call_name = tc.function.name
                        if tc.function.arguments:
                            tool_call_args += tc.function.arguments

        # Parse tool call if present
        if tool_call_name and tool_call_args:
            try:
                args = json.loads(tool_call_args)
                ticker = args.get("ticker", "").upper().strip()

                if tool_call_name == "add_stock" and ticker:
                    yield {"event": "action", "data": {"type": "add_stock", "ticker": ticker}}
                elif tool_call_name == "delete_stock" and ticker:
                    yield {"event": "action", "data": {"type": "delete_stock", "ticker": ticker}}
                elif tool_call_name == "add_thesis":
                    cat = args.get("category", "")
                    stmt = args.get("statement", "").strip()
                    if ticker and cat in CATEGORIES and len(stmt) >= 10:
                        yield {"event": "action", "data": {
                            "type": "add_thesis",
                            "ticker": ticker,
                            "category": cat,
                            "statement": stmt,
                        }}
            except json.JSONDecodeError:
                pass

        yield {"event": "done", "data": {}}

    except Exception as exc:
        logger.error("portfolio_chat_agent: stream error (%s)", exc)
        yield {"event": "error", "data": {"message": "Sorry, I encountered an error. Please try again."}}
