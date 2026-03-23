"""Signal Interpreter agent.

Maps collected signals (price + news) to selected thesis bullets,
assigning a sentiment (positive / negative / neutral) and confidence score.

Uses OpenAI for news→thesis mapping, with deterministic price rules
applied first so the system works even without LLM.
"""
import json
import logging
from dataclasses import dataclass

from app.core.config import settings
from app.agents.signal_collector import CollectedSignals, PriceSignal

logger = logging.getLogger(__name__)


@dataclass
class ThesisSignalMapping:
    thesis_id: int
    category: str
    statement: str
    sentiment: str      # "positive" | "negative" | "neutral"
    confidence: float   # 0.0 – 1.0
    signal_summary: str # human-readable reason


def _price_rules(price: PriceSignal, theses: list[dict]) -> list[ThesisSignalMapping]:
    """Deterministic rules: map price signals to thesis bullets."""
    mappings = []

    for t in theses:
        category = t["category"]
        stmt_lower = t["statement"].lower()
        sentiment = "neutral"
        confidence = 0.3
        signal_summary = ""

        # Strong downward price trend hits "core_beliefs" and "strengths"
        if price.month_change_pct < -15 and category in ("core_beliefs", "strengths"):
            sentiment = "negative"
            confidence = 0.7
            signal_summary = f"Price down {price.month_change_pct:.1f}% over 30 days, suggesting thesis pressure"

        # Strong upward trend supports core beliefs
        elif price.month_change_pct > 15 and category == "core_beliefs":
            sentiment = "positive"
            confidence = 0.6
            signal_summary = f"Price up {price.month_change_pct:.1f}% over 30 days"

        # Elevated volume + price drop: concern for strengths/leadership
        elif price.volume_ratio > 2.0 and price.day_change_pct < -3 and category in ("strengths", "leadership"):
            sentiment = "negative"
            confidence = 0.65
            signal_summary = f"Heavy sell volume ({price.volume_ratio:.1f}x avg) with {price.day_change_pct:.1f}% drop"

        # Near 52-week low: negative on core beliefs
        elif price.current_price <= price.fifty_two_week_low * 1.05 and category == "core_beliefs":
            sentiment = "negative"
            confidence = 0.6
            signal_summary = "Price near 52-week low, market losing confidence"

        # Near 52-week high: positive on catalysts
        elif price.current_price >= price.fifty_two_week_high * 0.95 and category == "catalysts":
            sentiment = "positive"
            confidence = 0.55
            signal_summary = "Price near 52-week high, catalysts being recognized"

        # Significant price drop may indicate a selected risk is materializing
        elif price.month_change_pct < -10 and category == "risks":
            sentiment = "negative"
            confidence = 0.5
            signal_summary = f"Price down {price.month_change_pct:.1f}% over 30 days — monitored risk may be materializing"

        # Downtrend (MA crossover) hits anything with momentum-related language
        elif price.trend == "down" and any(w in stmt_lower for w in ("growth", "expand", "increas", "momentum", "accelerat")):
            sentiment = "negative"
            confidence = 0.5
            signal_summary = f"Downtrend detected (MA20 {price.ma_20:.2f} < MA50 {price.ma_50:.2f})"

        if signal_summary:
            mappings.append(ThesisSignalMapping(
                thesis_id=t["id"],
                category=category,
                statement=t["statement"],
                sentiment=sentiment,
                confidence=confidence,
                signal_summary=signal_summary,
            ))

    return mappings


INTERPRETER_SYSTEM = """You are an investment thesis analyst.

Given a list of news headlines and a list of investment thesis statements,
identify which thesis statements each headline supports, challenges, or is neutral about.

Return a JSON array:
[
  {
    "thesis_id": <int>,
    "sentiment": "positive" | "negative" | "neutral",
    "confidence": <float 0.0-1.0>,
    "signal_summary": "<one sentence reason, max 20 words>"
  }
]

Rules:
- Only include thesis statements that a headline clearly relates to
- Be conservative: if unsure, set confidence < 0.5
- Negative sentiment = headline challenges or weakens the thesis statement
- Positive sentiment = headline confirms or strengthens it
- No buy/sell language"""


def _llm_news_mapping(theses: list[dict], headlines: list[str]) -> list[ThesisSignalMapping]:
    if not headlines or not theses or not settings.OPENAI_API_KEY:
        return []
    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.OPENAI_API_KEY)

        thesis_list = "\n".join(f"[{t['id']}] ({t['category']}) {t['statement']}" for t in theses)
        news_list = "\n".join(f"- {h}" for h in headlines[:8])

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            temperature=0.2,
            max_tokens=800,
            messages=[
                {"role": "system", "content": INTERPRETER_SYSTEM},
                {"role": "user", "content": f"THESIS STATEMENTS:\n{thesis_list}\n\nNEWS HEADLINES:\n{news_list}\n\nReturn JSON array under key 'mappings'."},
            ],
        )
        raw = response.choices[0].message.content or "{}"
        data = json.loads(raw)
        items = data.get("mappings", data) if isinstance(data, dict) else data
        if not isinstance(items, list):
            return []

        thesis_lookup = {t["id"]: t for t in theses}
        results = []
        for item in items:
            tid = item.get("thesis_id")
            if tid not in thesis_lookup:
                continue
            t = thesis_lookup[tid]
            results.append(ThesisSignalMapping(
                thesis_id=tid,
                category=t["category"],
                statement=t["statement"],
                sentiment=item.get("sentiment", "neutral"),
                confidence=float(item.get("confidence", 0.5)),
                signal_summary=item.get("signal_summary", ""),
            ))
        return results
    except Exception as exc:
        logger.error("signal_interpreter: LLM news mapping failed: %s", exc)
        return []


def _merge_mappings(
    price_maps: list[ThesisSignalMapping],
    news_maps: list[ThesisSignalMapping],
) -> list[ThesisSignalMapping]:
    """Merge price and news mappings. For same thesis_id, keep the highest-confidence negative."""
    combined: dict[int, ThesisSignalMapping] = {}

    for m in price_maps + news_maps:
        existing = combined.get(m.thesis_id)
        if not existing:
            combined[m.thesis_id] = m
        else:
            # Prefer negative signals; among same sentiment prefer higher confidence
            if m.sentiment == "negative" and existing.sentiment != "negative":
                combined[m.thesis_id] = m
            elif m.sentiment == existing.sentiment and m.confidence > existing.confidence:
                combined[m.thesis_id] = m

    return list(combined.values())


def interpret_signals(signals: CollectedSignals, selected_theses: list[dict]) -> list[ThesisSignalMapping]:
    """Map all signals to selected thesis bullets. Never raises."""
    if not selected_theses:
        return []

    price_maps: list[ThesisSignalMapping] = []
    if signals.price and signals.price.available:
        try:
            price_maps = _price_rules(signals.price, selected_theses)
        except Exception as exc:
            logger.error("signal_interpreter: price rules failed: %s", exc)

    headlines = [f"{n.title}. {n.snippet}" for n in signals.news if n.title]
    news_maps = _llm_news_mapping(selected_theses, headlines)

    return _merge_mappings(price_maps, news_maps)
