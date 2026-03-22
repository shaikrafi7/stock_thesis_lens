"""Explanation Agent.

Takes the evaluation result and generates:
  - A 1-line summary (e.g. "Thesis weakening: 2 core beliefs under pressure")
  - Per broken-point explanations tied directly to thesis statements

Follows guardrail: no buy/sell language, only "thesis weakening due to..."
Falls back to a template-based summary if OpenAI unavailable.
"""
import logging

from app.core.config import settings
from app.agents.thesis_evaluator import EvaluationResult

logger = logging.getLogger(__name__)

EXPLANATION_SYSTEM = """You are a clear, honest investment thesis analyst.

Write a brief explanation of why an investment thesis has been scored as it was.
Rules:
- Never say "buy", "sell", "hold", or give financial advice
- Say "thesis weakening due to..." or "thesis holding despite..."
- Be direct and specific — reference the actual thesis points
- Keep total response under 120 words
- Tone: calm, honest, analytical"""


def _template_explanation(ticker: str, result: EvaluationResult) -> str:
    if not result.broken_points:
        return f"{ticker} thesis appears intact — no significant negative signals detected against your selected beliefs."

    count = len(result.broken_points)
    categories = list({bp["category"] for bp in result.broken_points})
    category_str = " and ".join(categories)
    action = "weakening" if result.status in ("yellow", "red") else "under mild pressure"

    lines = [f"{ticker} thesis {action}: {count} point(s) flagged in {category_str}."]
    for bp in result.broken_points[:3]:
        lines.append(f"• {bp['statement'][:60]}... — {bp['signal']}")
    return "\n".join(lines)


def generate_explanation(ticker: str, result: EvaluationResult) -> str:
    """Generate a plain-language explanation for the evaluation. Never raises."""
    if not result.broken_points:
        return f"{ticker} thesis appears intact — no significant negative signals detected against your selected beliefs."

    if not settings.OPENAI_API_KEY:
        return _template_explanation(ticker, result)

    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.OPENAI_API_KEY)

        broken_summary = "\n".join(
            f"- [{bp['category']}] \"{bp['statement'][:80]}\" → {bp['signal']} (deducted {bp['deduction']} pts)"
            for bp in result.broken_points
        )

        prompt = (
            f"Stock: {ticker}\n"
            f"Thesis score: {result.score}/100 ({result.status.upper()})\n\n"
            f"Flagged thesis points:\n{broken_summary}\n\n"
            "Write a brief, honest explanation of the thesis status."
        )

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.3,
            max_tokens=180,
            messages=[
                {"role": "system", "content": EXPLANATION_SYSTEM},
                {"role": "user", "content": prompt},
            ],
        )
        return response.choices[0].message.content.strip()
    except Exception as exc:
        logger.error("explanation_agent: OpenAI failed for %s: %s", ticker, exc)
        return _template_explanation(ticker, result)
