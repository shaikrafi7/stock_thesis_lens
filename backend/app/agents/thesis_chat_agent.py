import json
import logging
from dataclasses import dataclass
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

CATEGORIES = ["core_beliefs", "strengths", "risks", "leadership", "catalysts"]

SYSTEM_PROMPT = """You are a research assistant helping a long-term retail investor analyze a stock and refine their investment thesis.

Your role:
- Answer research questions about the company (business model, moat, risks, leadership, catalysts)
- Help the investor think through and articulate thesis points
- Suggest specific thesis statements when useful

Rules:
- Be factual and balanced — cover bull and bear cases honestly
- No buy/sell recommendations or direct financial advice
- Focus on structural, durable factors for a 3–10 year time horizon
- Keep responses concise (3–5 sentences unless more detail is requested)

You MUST always respond with valid JSON in this exact format:

{
  "message": "your response text here",
  "suggestion": null
}

Or, if you want to propose a specific thesis point for the user to add:

{
  "message": "your response text here (explain why this point matters)",
  "suggestion": {
    "category": "one of: core_beliefs, strengths, risks, leadership, catalysts",
    "statement": "A complete sentence under 25 words, written from a long-term investor perspective"
  }
}

Include a suggestion whenever your response identifies a specific, well-formed thesis point worth adding. You don't need to wait for an explicit request — if you're describing a strength, risk, catalyst, or leadership trait that would make a concise thesis statement, offer it as a suggestion."""


@dataclass
class ThesisSuggestion:
    category: str
    statement: str


@dataclass
class ChatResult:
    message: str
    suggestion: Optional[ThesisSuggestion] = None


def _build_context(company_name: str, ticker: str, existing_theses: list[dict]) -> str:
    lines = [f"Stock: {ticker} — {company_name}"]
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
) -> ChatResult:
    if not settings.OPENAI_API_KEY:
        return ChatResult(message="OpenAI API key not configured.")

    from openai import OpenAI

    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    context = _build_context(company_name, ticker, existing_theses)
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
