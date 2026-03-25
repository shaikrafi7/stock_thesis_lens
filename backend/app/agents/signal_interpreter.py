"""Signal Interpreter agent.

Maps collected signals to selected thesis bullets,
assigning a sentiment (positive / negative / neutral) and confidence score.

Uses OpenAI for news→thesis mapping, with deterministic rules
applied first so the system works even without LLM.
"""
import json
import logging
from dataclasses import dataclass

from app.core.config import settings
from app.agents.signal_collector import (
    CollectedSignals, FundamentalSignal, PriceSignal,
    InsiderSignal, FilingSignal, ValuationSignal,
    FinancialHealthSignal, OwnershipSignal,
)

logger = logging.getLogger(__name__)


@dataclass
class ThesisSignalMapping:
    thesis_id: int
    category: str
    statement: str
    sentiment: str      # "positive" | "negative" | "neutral"
    confidence: float   # 0.0 – 1.0
    signal_summary: str # human-readable reason


# ── Deterministic price rules ──────────────────────────────────────────────

def _price_rules(price: PriceSignal, theses: list[dict]) -> list[ThesisSignalMapping]:
    mappings = []
    for t in theses:
        category = t["category"]
        stmt_lower = t["statement"].lower()
        sentiment = "neutral"
        confidence = 0.3
        signal_summary = ""

        # Strong downward price trend
        if price.month_change_pct < -15 and category in ("competitive_moat", "growth_trajectory"):
            sentiment = "negative"
            confidence = 0.7
            signal_summary = f"Price down {price.month_change_pct:.1f}% over 30 days, suggesting thesis pressure"

        elif price.month_change_pct > 15 and category == "competitive_moat":
            sentiment = "positive"
            confidence = 0.6
            signal_summary = f"Price up {price.month_change_pct:.1f}% over 30 days — market recognizing moat"

        elif price.volume_ratio > 2.0 and price.day_change_pct < -3 and category in ("competitive_moat", "ownership_conviction"):
            sentiment = "negative"
            confidence = 0.65
            signal_summary = f"Heavy sell volume ({price.volume_ratio:.1f}x avg) with {price.day_change_pct:.1f}% drop"

        elif price.current_price <= price.fifty_two_week_low * 1.05 and category in ("competitive_moat", "valuation"):
            if category == "valuation":
                sentiment = "positive"
                confidence = 0.5
                signal_summary = "Price near 52-week low — potential value entry point"
            else:
                sentiment = "negative"
                confidence = 0.6
                signal_summary = "Price near 52-week low, market losing confidence"

        elif price.current_price >= price.fifty_two_week_high * 0.95 and category == "growth_trajectory":
            sentiment = "positive"
            confidence = 0.55
            signal_summary = "Price near 52-week high, growth being recognized"

        elif price.month_change_pct < -10 and category == "risks":
            sentiment = "negative"
            confidence = 0.5
            signal_summary = f"Price down {price.month_change_pct:.1f}% over 30 days — monitored risk may be materializing"

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


# ── Valuation rules ────────────────────────────────────────────────────────

def _valuation_rules(val: ValuationSignal, theses: list[dict]) -> list[ThesisSignalMapping]:
    if not val:
        return []
    mappings = []
    for t in theses:
        if t["category"] != "valuation":
            continue

        sentiment = "neutral"
        confidence = 0.3
        signal_summary = ""

        # High PE + high PEG = expensive
        if val.trailing_pe and val.trailing_pe > 40 and val.peg_ratio and val.peg_ratio > 2.5:
            sentiment = "negative"
            confidence = 0.65
            signal_summary = f"Expensive: P/E {val.trailing_pe:.1f}, PEG {val.peg_ratio:.1f} — growth may not justify price"
        elif val.peg_ratio and val.peg_ratio < 1.0:
            sentiment = "positive"
            confidence = 0.6
            signal_summary = f"PEG ratio {val.peg_ratio:.1f} suggests stock is undervalued relative to growth"
        elif val.trailing_pe and val.trailing_pe < 15:
            sentiment = "positive"
            confidence = 0.55
            signal_summary = f"P/E of {val.trailing_pe:.1f} — trading at a discount"

        # Trading vs analyst target
        if not signal_summary and val.current_price and val.analyst_target:
            pct_diff = (val.current_price - val.analyst_target) / val.analyst_target * 100
            if pct_diff > 20:
                sentiment = "negative"
                confidence = 0.55
                signal_summary = f"Trading {pct_diff:.0f}% above analyst target ${val.analyst_target:.0f}"
            elif pct_diff < -20:
                sentiment = "positive"
                confidence = 0.55
                signal_summary = f"Trading {abs(pct_diff):.0f}% below analyst target ${val.analyst_target:.0f}"

        if signal_summary:
            mappings.append(ThesisSignalMapping(
                thesis_id=t["id"],
                category=t["category"],
                statement=t["statement"],
                sentiment=sentiment,
                confidence=confidence,
                signal_summary=signal_summary,
            ))
    return mappings


# ── Financial health rules ─────────────────────────────────────────────────

def _financial_health_rules(fin: FinancialHealthSignal, theses: list[dict]) -> list[ThesisSignalMapping]:
    if not fin:
        return []
    mappings = []
    for t in theses:
        if t["category"] != "financial_health":
            continue

        sentiment = "neutral"
        confidence = 0.3
        signal_summary = ""

        # Debt concerns
        if fin.debt_to_equity and fin.debt_to_equity > 200:
            sentiment = "negative"
            confidence = 0.65
            signal_summary = f"Debt-to-equity ratio {fin.debt_to_equity:.0f}% — high leverage"
        elif fin.debt_to_equity is not None and fin.debt_to_equity < 50:
            sentiment = "positive"
            confidence = 0.55
            signal_summary = f"Conservative balance sheet: debt/equity {fin.debt_to_equity:.0f}%"

        # FCF
        if not signal_summary and fin.fcf is not None:
            if fin.fcf < 0:
                sentiment = "negative"
                confidence = 0.6
                signal_summary = "Negative free cash flow — burning cash"
            elif fin.fcf > 0 and fin.revenue and fin.fcf / fin.revenue > 0.15:
                sentiment = "positive"
                confidence = 0.6
                fcf_margin = fin.fcf / fin.revenue * 100
                signal_summary = f"Strong FCF margin of {fcf_margin:.1f}% — cash generative business"

        # ROE
        if not signal_summary and fin.roe is not None:
            if fin.roe > 0.20:
                sentiment = "positive"
                confidence = 0.55
                signal_summary = f"ROE of {fin.roe * 100:.1f}% — strong returns on capital"
            elif fin.roe < 0:
                sentiment = "negative"
                confidence = 0.55
                signal_summary = f"Negative ROE ({fin.roe * 100:.1f}%) — unprofitable"

        # Margins
        if not signal_summary and fin.gross_margin is not None:
            if fin.gross_margin > 0.60:
                sentiment = "positive"
                confidence = 0.5
                signal_summary = f"Gross margin {fin.gross_margin * 100:.1f}% — strong pricing power"
            elif fin.gross_margin < 0.20:
                sentiment = "negative"
                confidence = 0.5
                signal_summary = f"Low gross margin {fin.gross_margin * 100:.1f}% — limited pricing power"

        if signal_summary:
            mappings.append(ThesisSignalMapping(
                thesis_id=t["id"],
                category=t["category"],
                statement=t["statement"],
                sentiment=sentiment,
                confidence=confidence,
                signal_summary=signal_summary,
            ))
    return mappings


# ── Growth trajectory rules ────────────────────────────────────────────────

def _growth_rules(fin: FinancialHealthSignal, fund: FundamentalSignal | None, theses: list[dict]) -> list[ThesisSignalMapping]:
    mappings = []
    for t in theses:
        if t["category"] != "growth_trajectory":
            continue

        sentiment = "neutral"
        confidence = 0.3
        signal_summary = ""

        rev_growth = fin.revenue_growth if fin else None
        if rev_growth is None and fund:
            rev_growth = fund.revenue_growth

        if rev_growth is not None:
            if rev_growth > 0.20:
                sentiment = "positive"
                confidence = 0.65
                signal_summary = f"Revenue growing {rev_growth * 100:.1f}% YoY — strong trajectory"
            elif rev_growth < 0:
                sentiment = "negative"
                confidence = 0.65
                signal_summary = f"Revenue declining {rev_growth * 100:.1f}% YoY"
            elif rev_growth < 0.05:
                sentiment = "negative"
                confidence = 0.5
                signal_summary = f"Revenue growth stalling at {rev_growth * 100:.1f}% YoY"

        # Rule of 40 (if we have both growth and margin)
        if not signal_summary and rev_growth is not None and fin and fin.operating_margin is not None:
            rule_of_40 = (rev_growth * 100) + (fin.operating_margin * 100)
            if rule_of_40 > 40:
                sentiment = "positive"
                confidence = 0.6
                signal_summary = f"Rule of 40 score: {rule_of_40:.0f} (growth {rev_growth * 100:.0f}% + margin {fin.operating_margin * 100:.0f}%)"
            elif rule_of_40 < 20:
                sentiment = "negative"
                confidence = 0.55
                signal_summary = f"Rule of 40 score: {rule_of_40:.0f} — below threshold"

        # EPS beat/miss
        if not signal_summary and fund and fund.eps_beat is not None:
            if fund.eps_beat and fund.surprise_pct and fund.surprise_pct > 10:
                sentiment = "positive"
                confidence = 0.55
                signal_summary = f"EPS beat by {fund.surprise_pct:.1f}% — execution on track"
            elif not fund.eps_beat and fund.surprise_pct and fund.surprise_pct < -10:
                sentiment = "negative"
                confidence = 0.55
                signal_summary = f"EPS missed by {abs(fund.surprise_pct):.1f}% — growth execution concern"

        if signal_summary:
            mappings.append(ThesisSignalMapping(
                thesis_id=t["id"],
                category=t["category"],
                statement=t["statement"],
                sentiment=sentiment,
                confidence=confidence,
                signal_summary=signal_summary,
            ))
    return mappings


# ── Ownership & conviction rules ──────────────────────────────────────────

def _ownership_rules(own: OwnershipSignal, insider: list[InsiderSignal], theses: list[dict]) -> list[ThesisSignalMapping]:
    mappings = []
    for t in theses:
        if t["category"] != "ownership_conviction":
            continue

        sentiment = "neutral"
        confidence = 0.3
        signal_summary = ""

        # Short interest
        if own and own.short_pct_float is not None:
            if own.short_pct_float > 0.10:
                sentiment = "negative"
                confidence = 0.6
                signal_summary = f"Short interest {own.short_pct_float * 100:.1f}% of float — significant bearish bets"
            elif own.short_pct_float < 0.02:
                sentiment = "positive"
                confidence = 0.5
                signal_summary = f"Low short interest ({own.short_pct_float * 100:.1f}%) — minimal bearish sentiment"

        # Analyst consensus
        if not signal_summary and own and own.recommendation:
            if own.recommendation in ("strong_buy", "buy"):
                sentiment = "positive"
                confidence = 0.55
                count = f" ({own.analyst_count} analysts)" if own.analyst_count else ""
                signal_summary = f"Analyst consensus: {own.recommendation.replace('_', ' ')}{count}"
            elif own.recommendation in ("sell", "strong_sell"):
                sentiment = "negative"
                confidence = 0.55
                signal_summary = f"Analyst consensus: {own.recommendation.replace('_', ' ')}"

        # Institutional ownership
        if not signal_summary and own and own.institutional_pct is not None:
            if own.institutional_pct > 0.80:
                sentiment = "positive"
                confidence = 0.5
                signal_summary = f"High institutional ownership ({own.institutional_pct * 100:.1f}%) — smart money conviction"
            elif own.institutional_pct < 0.20:
                sentiment = "negative"
                confidence = 0.45
                signal_summary = f"Low institutional ownership ({own.institutional_pct * 100:.1f}%) — limited institutional interest"

        # Insider activity
        if not signal_summary and insider:
            filing_count = len(insider)
            if filing_count >= 5:
                sentiment = "neutral"
                confidence = 0.5
                signal_summary = f"{filing_count} insider transactions in 90 days — elevated activity"

        if signal_summary:
            mappings.append(ThesisSignalMapping(
                thesis_id=t["id"],
                category=t["category"],
                statement=t["statement"],
                sentiment=sentiment,
                confidence=confidence,
                signal_summary=signal_summary,
            ))
    return mappings


# ── Filing rules ───────────────────────────────────────────────────────────

def _filing_rules(filings: list[FilingSignal], theses: list[dict]) -> list[ThesisSignalMapping]:
    if not filings:
        return []
    mappings = []
    eight_k_count = sum(1 for f in filings if f.form_type.startswith("8-K"))

    for t in theses:
        if t["category"] == "risks" and eight_k_count >= 3:
            mappings.append(ThesisSignalMapping(
                thesis_id=t["id"],
                category=t["category"],
                statement=t["statement"],
                sentiment="neutral",
                confidence=0.5,
                signal_summary=f"{eight_k_count} 8-K filings in 90 days — multiple corporate events to review",
            ))
    return mappings


# ── LLM news mapping ──────────────────────────────────────────────────────

INTERPRETER_SYSTEM = """You are an investment thesis analyst.

Given a list of news headlines and a list of investment thesis statements,
determine each headline's INVESTMENT IMPACT on the thesis statements.

Return a JSON object with key "mappings" containing an array:
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
- Think in terms of INVESTMENT IMPACT, not whether the headline "confirms" the thesis text
- Positive sentiment = headline is GOOD for the investment thesis (strengthens the bull case)
- Negative sentiment = headline is BAD for the investment thesis (weakens the bull case)
- IMPORTANT for "risks" category: A headline showing a risk IS materializing is NEGATIVE (bad for investment). A headline showing a risk is NOT materializing is POSITIVE (good for investment).
- No buy/sell language"""


def _format_fundamentals(f: FundamentalSignal) -> str:
    lines = []
    if f.pe_ratio is not None:
        lines.append(f"- P/E Ratio: {f.pe_ratio:.1f}")
    if f.revenue_growth is not None:
        lines.append(f"- Revenue Growth (YoY): {f.revenue_growth * 100:.1f}%" if f.revenue_growth < 10 else f"- Revenue Growth (YoY): {f.revenue_growth:.1f}%")
    if f.gross_profit_margin is not None:
        lines.append(f"- Gross Margin: {f.gross_profit_margin * 100:.1f}%" if f.gross_profit_margin <= 1 else f"- Gross Margin: {f.gross_profit_margin:.1f}%")
    if f.eps_actual is not None and f.eps_estimate is not None:
        beat_str = "beat" if f.eps_beat else "missed"
        pct_str = f" ({f.surprise_pct:+.1f}%)" if f.surprise_pct is not None else ""
        lines.append(f"- Latest EPS: {f.eps_actual:.2f} vs estimate {f.eps_estimate:.2f} — {beat_str}{pct_str}")
    return "\n".join(lines)


def _llm_news_mapping(
    theses: list[dict],
    headlines: list[str],
    fundamentals: FundamentalSignal | None = None,
) -> list[ThesisSignalMapping]:
    if not headlines or not theses or not settings.OPENAI_API_KEY:
        return []
    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.OPENAI_API_KEY)

        thesis_list = "\n".join(f"[{t['id']}] ({t['category']}) {t['statement']}" for t in theses)
        news_list = "\n".join(f"- {h}" for h in headlines[:8])

        user_content = f"THESIS STATEMENTS:\n{thesis_list}\n\nNEWS HEADLINES:\n{news_list}"
        if fundamentals:
            fund_str = _format_fundamentals(fundamentals)
            if fund_str:
                user_content += f"\n\nFUNDAMENTAL SIGNALS:\n{fund_str}"
        user_content += "\n\nReturn JSON object with 'mappings' key."

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            temperature=0.2,
            max_tokens=800,
            messages=[
                {"role": "system", "content": INTERPRETER_SYSTEM},
                {"role": "user", "content": user_content},
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

        # Safety net: invert sentiment for risk theses.
        for r in results:
            if r.category == "risks":
                if r.sentiment == "positive":
                    r.sentiment = "negative"
                elif r.sentiment == "negative":
                    r.sentiment = "positive"

        return results
    except Exception as exc:
        logger.error("signal_interpreter: LLM news mapping failed: %s", exc)
        return []


# ── Merge & interpret ──────────────────────────────────────────────────────

def _merge_mappings(*mapping_lists: list[ThesisSignalMapping]) -> list[ThesisSignalMapping]:
    """Merge all mapping lists. For same thesis_id, keep the highest-confidence negative."""
    combined: dict[int, ThesisSignalMapping] = {}

    for maps in mapping_lists:
        for m in maps:
            existing = combined.get(m.thesis_id)
            if not existing:
                combined[m.thesis_id] = m
            else:
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

    # Build context for LLM: headlines + insider/filing summaries
    headlines = [f"{n.title}. {n.snippet}" for n in signals.news if n.title]

    if signals.insider_transactions:
        count = len(signals.insider_transactions)
        recent = signals.insider_transactions[0].date if signals.insider_transactions else ""
        headlines.append(f"[SEC INSIDER] {count} insider Form 4 filings in last 90 days (most recent: {recent})")

    if signals.recent_filings:
        for f in signals.recent_filings[:3]:
            headlines.append(f"[SEC FILING] {f.form_type} filed {f.date}: {f.title}")

    news_maps = _llm_news_mapping(selected_theses, headlines, signals.fundamentals)

    # Deterministic rules for new categories
    valuation_maps = _valuation_rules(signals.valuation, selected_theses)
    financial_maps = _financial_health_rules(signals.financial_health, selected_theses)
    growth_maps = _growth_rules(signals.financial_health, signals.fundamentals, selected_theses)
    ownership_maps = _ownership_rules(signals.ownership, signals.insider_transactions, selected_theses)
    filing_maps = _filing_rules(signals.recent_filings, selected_theses)

    return _merge_mappings(
        price_maps, news_maps, valuation_maps, financial_maps,
        growth_maps, ownership_maps, filing_maps,
    )
