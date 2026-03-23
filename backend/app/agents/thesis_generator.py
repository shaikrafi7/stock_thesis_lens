import json
import logging
from dataclasses import dataclass, field

from app.core.config import settings

logger = logging.getLogger(__name__)

CATEGORIES = ["core_beliefs", "strengths", "risks", "leadership", "catalysts"]

FALLBACK_THESIS: dict[str, list[str]] = {
    "core_beliefs": ["[Add your core belief for this stock]"],
    "strengths": ["[Add a key competitive strength]"],
    "risks": ["[Add a key risk to monitor]"],
    "leadership": ["[Add a leadership or management observation]"],
    "catalysts": ["[Add a near-term or long-term catalyst]"],
}

SYSTEM_PROMPT = """You are a research assistant helping a long-term retail investor build a structured investment thesis.

Return a JSON object with exactly these five keys:
  core_beliefs, strengths, risks, leadership, catalysts

Each key maps to a list of up to 5 bullet statements. Rules:
- Each bullet must be a complete, standalone sentence — not a fragment
- Write from the perspective of a long-term (3–10 year) investor
- Focus on structural, durable factors — not short-term price movements
- No buy/sell recommendations or direct financial advice
- Be honest about risks — do not downplay them
- Keep each bullet under 25 words"""


@dataclass
class GeneratedThesis:
    category: str
    statement: str
    weight: float = field(default=1.0)


def _call_openai(ticker: str, company_name: str) -> dict[str, list[str]]:
    from openai import OpenAI

    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    response = client.chat.completions.create(
        model="gpt-4o",
        response_format={"type": "json_object"},
        temperature=0.3,
        max_tokens=1500,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Generate an investment thesis for {ticker} ({company_name})."},
        ],
    )
    raw = response.choices[0].message.content or "{}"
    return json.loads(raw)


def _parse_bullets(data: dict) -> list[GeneratedThesis]:
    results = []
    for category in CATEGORIES:
        bullets = data.get(category, [])
        if not isinstance(bullets, list):
            continue
        for statement in bullets[:5]:
            if isinstance(statement, str) and statement.strip():
                results.append(GeneratedThesis(category=category, statement=statement.strip()))
    return results


def generate_thesis(ticker: str, company_name: str) -> list[GeneratedThesis]:
    """Generate structured thesis bullets for a stock.

    Returns placeholder bullets if the OpenAI call fails, so the caller
    never receives an exception (guardrail: fallback mode).
    """
    try:
        # Conditionally apply LangSmith tracing
        if settings.LANGCHAIN_TRACING_V2.lower() == "true" and settings.LANGSMITH_API_KEY:
            try:
                from langsmith import traceable

                traced_call = traceable(name="thesis_generator", run_type="llm")(_call_openai)
                data = traced_call(ticker, company_name)
            except Exception:
                data = _call_openai(ticker, company_name)
        else:
            data = _call_openai(ticker, company_name)

        results = _parse_bullets(data)
        if results:
            return results

        logger.warning("thesis_generator: OpenAI returned empty bullets for %s, using fallback", ticker)
        return _parse_bullets(FALLBACK_THESIS)

    except Exception as exc:
        logger.error("thesis_generator: OpenAI call failed for %s (%s), using fallback", ticker, exc)
        return _parse_bullets(FALLBACK_THESIS)
