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

SYSTEM_PROMPT = """You are a research assistant helping a long-term retail investor analyze a stock and refine their investment thesis from the BUYER'S PERSPECTIVE.

Your role:
- Answer research questions about the company (moat, growth, valuation, financial health, ownership signals, risks)
- Help the investor think through and articulate thesis points
- Suggest specific thesis statements when useful
- When asked about today's performance or recent events, use the live market data and recent news provided in the context

Rules:
- Be factual and balanced — cover bull and bear cases honestly
- No buy/sell recommendations or direct financial advice
- Focus on structural, durable factors for a 1+ year time horizon
- Keep responses concise (3–5 sentences unless more detail is requested)
- When market data is available, reference specific numbers (price, change%, volume) to ground your analysis
- When referencing news, include a markdown link to the source: [headline](url). Only link sources provided in the context — never fabricate URLs.

You MUST always respond with valid JSON in this exact format:

{
  "message": "your response text here",
  "suggestion": null
}

Or, if you want to propose a specific thesis point for the user to add:

{
  "message": "your response text here (explain why this point matters)",
  "suggestion": {
    "category": "one of: competitive_moat, growth_trajectory, valuation, financial_health, ownership_conviction, risks",
    "statement": "A complete sentence under 25 words, written from a buyer's investment perspective"
  }
}

Category guide:
- competitive_moat: Network effects, switching costs, brand power, scale, IP, flywheel dynamics
- growth_trajectory: Revenue/earnings growth, TAM, product pipeline, Rule of 40
- valuation: P/E, PEG, EV/EBITDA, margin of safety, peer comparison
- financial_health: FCF, balance sheet, margins, capital allocation, debt
- ownership_conviction: Insider/institutional ownership, analyst consensus, short interest
- risks: Regulatory, competitive disruption, concentration, macro, key person risk

Include a suggestion whenever your response identifies a specific, well-formed thesis point worth adding."""


@dataclass
class ThesisSuggestion:
    category: str
    statement: str


@dataclass
class ChatResult:
    message: str
    suggestion: Optional[ThesisSuggestion] = None


def _build_context(
    company_name: str,
    ticker: str,
    existing_theses: list[dict],
    market_data: str = "",
    recent_news: list[dict] | None = None,
) -> str:
    lines = [f"Stock: {ticker} — {company_name}"]

    if market_data:
        lines.append(f"\nLive Market Data:\n{market_data}")

    if recent_news:
        lines.append("\nRecent News:")
        for n in recent_news[:5]:
            title = n.get("title", "")
            desc = n.get("description", "")
            url = n.get("url", "")
            snippet = desc[:150] + "…" if len(desc) > 150 else desc
            lines.append(f"  - {title}")
            if snippet:
                lines.append(f"    {snippet}")
            if url:
                lines.append(f"    Source: {url}")

    if existing_theses:
        by_category: dict[str, list[str]] = {}
        for t in existing_theses:
            cat = t.get("category", "other")
            by_category.setdefault(cat, []).append(t.get("statement", ""))
        lines.append("\nExisting thesis points:")
        for cat, stmts in by_category.items():
            lines.append(f"  {cat.replace('_', ' ').title()}:")
            for s in stmts:
                lines.append(f"    - {s}")
    else:
        lines.append("No thesis points added yet.")
    return "\n".join(lines)


def chat(
    ticker: str,
    company_name: str,
    existing_theses: list[dict],
    messages: list[dict],
    market_data: str = "",
    recent_news: list[dict] | None = None,
) -> ChatResult:
    if not settings.OPENAI_API_KEY:
        return ChatResult(message="OpenAI API key not configured.")

    from openai import OpenAI

    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    context = _build_context(company_name, ticker, existing_theses, market_data, recent_news)
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
        suggestion_data = data.get("suggestion")

        suggestion: Optional[ThesisSuggestion] = None
        if isinstance(suggestion_data, dict):
            cat = suggestion_data.get("category", "")
            stmt = suggestion_data.get("statement", "").strip()
            if cat in CATEGORIES and len(stmt) >= 10:
                suggestion = ThesisSuggestion(category=cat, statement=stmt)

        return ChatResult(message=message_text, suggestion=suggestion)

    except Exception as exc:
        logger.error("thesis_chat_agent: error for %s (%s)", ticker, exc)
        return ChatResult(message="Sorry, I encountered an error. Please try again.")


# ── Streaming variant ─────────────────────────────────────────────────────

STREAM_SYSTEM_PROMPT = """You are a research assistant helping a long-term retail investor analyze a stock and refine their investment thesis from the BUYER'S PERSPECTIVE.

Your role:
- Answer research questions about the company (moat, growth, valuation, financial health, ownership signals, risks)
- Help the investor think through and articulate thesis points
- When asked about today's performance or recent events, use the live market data and recent news provided in the context

Rules:
- Be factual and balanced — cover bull and bear cases honestly
- No buy/sell recommendations or direct financial advice
- Focus on structural, durable factors for a 1+ year time horizon
- Keep responses concise (3–5 sentences unless more detail is requested)
- When market data is available, reference specific numbers (price, change%, volume) to ground your analysis
- When referencing news, include a markdown link to the source: [headline](url). Only link sources provided in the context — never fabricate URLs.
- If you identify a specific, well-formed thesis point worth adding, use the suggest_thesis tool to propose it
- If the user asks to evaluate, re-evaluate, check their thesis score, or run an evaluation, use the run_evaluation tool

Categories: competitive_moat, growth_trajectory, valuation, financial_health, ownership_conviction, risks"""

SUGGEST_THESIS_TOOL = {
    "type": "function",
    "function": {
        "name": "suggest_thesis",
        "description": "Suggest a thesis point for the user to add to their investment thesis",
        "parameters": {
            "type": "object",
            "properties": {
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
            "required": ["category", "statement"],
        },
    },
}

RUN_EVALUATION_TOOL = {
    "type": "function",
    "function": {
        "name": "run_evaluation",
        "description": "Run a full thesis evaluation for this stock when the user asks to evaluate, re-evaluate, or check their thesis score",
        "parameters": {
            "type": "object",
            "properties": {},
        },
    },
}


def chat_stream(
    ticker: str,
    company_name: str,
    existing_theses: list[dict],
    messages: list[dict],
    market_data: str = "",
    recent_news: list[dict] | None = None,
) -> Generator[dict, None, None]:
    """Yield SSE event dicts: {"event": "token"|"suggestion"|"done"|"error", "data": ...}"""
    if not settings.OPENAI_API_KEY:
        yield {"event": "error", "data": {"message": "OpenAI API key not configured."}}
        return

    from openai import OpenAI

    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    context = _build_context(company_name, ticker, existing_theses, market_data, recent_news)
    system_content = f"{STREAM_SYSTEM_PROMPT}\n\nContext:\n{context}"

    openai_messages = [{"role": "system", "content": system_content}]
    openai_messages.extend(messages)

    try:
        stream = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=openai_messages,
            tools=[SUGGEST_THESIS_TOOL, RUN_EVALUATION_TOOL],
            temperature=0.4,
            max_tokens=600,
            stream=True,
        )

        # Accumulate all tool calls (there may be multiple)
        tool_calls: dict[int, dict] = {}  # index -> {id, name, args}

        for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if not delta:
                continue

            # Stream text content
            if delta.content:
                yield {"event": "token", "data": {"content": delta.content}}

            # Accumulate tool calls
            if delta.tool_calls:
                for tc in delta.tool_calls:
                    idx = tc.index if tc.index is not None else 0
                    if idx not in tool_calls:
                        tool_calls[idx] = {"id": "", "name": "", "args": ""}
                    if tc.id:
                        tool_calls[idx]["id"] = tc.id
                    if tc.function:
                        if tc.function.name:
                            tool_calls[idx]["name"] = tc.function.name
                        if tc.function.arguments:
                            tool_calls[idx]["args"] += tc.function.arguments

        # Process all tool calls
        for tc_data in tool_calls.values():
            if tc_data["name"] == "suggest_thesis" and tc_data["args"]:
                try:
                    args = json.loads(tc_data["args"])
                    cat = args.get("category", "")
                    stmt = args.get("statement", "").strip()
                    if cat in CATEGORIES and len(stmt) >= 10:
                        yield {"event": "suggestion", "data": {"category": cat, "statement": stmt}}
                except json.JSONDecodeError:
                    pass
            elif tc_data["name"] == "run_evaluation":
                yield {"event": "evaluation", "data": {}}

        yield {"event": "done", "data": {}}

    except Exception as exc:
        logger.error("thesis_chat_agent: stream error for %s (%s)", ticker, exc)
        yield {"event": "error", "data": {"message": "Sorry, I encountered an error. Please try again."}}
