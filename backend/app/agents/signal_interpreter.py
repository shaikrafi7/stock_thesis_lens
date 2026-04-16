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
            signal_summary = f"Price down {price.month_change_pct:.1f}% over 30 days -- monitored risk may be materializing"

        elif price.month_change_pct > 8 and category in ("competitive_moat", "growth_trajectory"):
            sentiment = "positive"
            confidence = 0.45
            signal_summary = f"Solid monthly gain of {price.month_change_pct:.1f}%"

        elif price.month_change_pct < -8 and category in ("competitive_moat", "growth_trajectory"):
            sentiment = "negative"
            confidence = 0.45
            signal_summary = f"Notable monthly decline of {price.month_change_pct:.1f}%"

        elif price.week_change_pct > 5 and price.month_change_pct > 3 and category == "growth_trajectory":
            sentiment = "positive"
            confidence = 0.40
            signal_summary = f"Building momentum: +{price.week_change_pct:.1f}% week, +{price.month_change_pct:.1f}% month"

        elif price.week_change_pct < -5 and price.month_change_pct < -3 and category in ("competitive_moat", "risks"):
            sentiment = "negative"
            confidence = 0.40
            signal_summary = f"Accelerating decline: {price.week_change_pct:.1f}% week, {price.month_change_pct:.1f}% month"

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

        def _add(sentiment: str, confidence: float, summary: str) -> None:
            mappings.append(ThesisSignalMapping(
                thesis_id=t["id"],
                category=t["category"],
                statement=t["statement"],
                sentiment=sentiment,
                confidence=confidence,
                signal_summary=summary,
            ))

        # High PE + high PEG = expensive (extreme)
        if val.trailing_pe and val.trailing_pe > 40 and val.peg_ratio and val.peg_ratio > 2.5:
            _add("negative", 0.65, f"Expensive: P/E {val.trailing_pe:.1f}, PEG {val.peg_ratio:.1f} -- growth may not justify price")

        # Moderately expensive
        if val.trailing_pe and val.trailing_pe > 30 and val.peg_ratio and val.peg_ratio > 2.0:
            _add("negative", 0.50, f"Moderately expensive: P/E {val.trailing_pe:.1f}, PEG {val.peg_ratio:.1f}")

        if val.peg_ratio and val.peg_ratio < 1.0:
            _add("positive", 0.60, f"PEG ratio {val.peg_ratio:.1f} suggests stock is undervalued relative to growth")

        if val.trailing_pe and val.trailing_pe < 15:
            _add("positive", 0.55, f"P/E of {val.trailing_pe:.1f} -- trading at a discount")

        if val.trailing_pe and 15 <= val.trailing_pe <= 20 and val.peg_ratio and val.peg_ratio < 1.5:
            _add("positive", 0.50, f"Reasonable value: P/E {val.trailing_pe:.1f}, PEG {val.peg_ratio:.1f}")

        # EV/EBITDA
        if val.ev_ebitda and val.ev_ebitda > 25:
            _add("negative", 0.50, f"High enterprise valuation: EV/EBITDA {val.ev_ebitda:.1f}")
        elif val.ev_ebitda and val.ev_ebitda < 10:
            _add("positive", 0.50, f"Attractive enterprise value: EV/EBITDA {val.ev_ebitda:.1f}")

        # Price-to-book
        if val.pb_ratio and val.pb_ratio > 10:
            _add("negative", 0.45, f"Trading at {val.pb_ratio:.1f}x book value")
        elif val.pb_ratio and val.pb_ratio < 1.5:
            _add("positive", 0.50, f"Near book value: P/B {val.pb_ratio:.1f}")

        # Trading vs analyst target
        if val.current_price and val.analyst_target:
            pct_diff = (val.current_price - val.analyst_target) / val.analyst_target * 100
            if pct_diff > 20:
                _add("negative", 0.55, f"Trading {pct_diff:.0f}% above analyst target ${val.analyst_target:.0f}")
            elif pct_diff < -20:
                _add("positive", 0.55, f"Trading {abs(pct_diff):.0f}% below analyst target ${val.analyst_target:.0f}")

    return mappings


# ── Financial health rules ─────────────────────────────────────────────────

def _financial_health_rules(fin: FinancialHealthSignal, theses: list[dict]) -> list[ThesisSignalMapping]:
    if not fin:
        return []
    mappings = []
    for t in theses:
        if t["category"] != "financial_health":
            continue

        def _add(sentiment: str, confidence: float, summary: str) -> None:
            mappings.append(ThesisSignalMapping(
                thesis_id=t["id"],
                category=t["category"],
                statement=t["statement"],
                sentiment=sentiment,
                confidence=confidence,
                signal_summary=summary,
            ))

        # Debt concerns
        if fin.debt_to_equity and fin.debt_to_equity > 200:
            _add("negative", 0.65, f"Debt-to-equity ratio {fin.debt_to_equity:.0f}% -- high leverage")
        elif fin.debt_to_equity is not None and fin.debt_to_equity < 50:
            _add("positive", 0.55, f"Conservative balance sheet: debt/equity {fin.debt_to_equity:.0f}%")

        # Moderate leverage (graduated)
        if fin.debt_to_equity and 100 < fin.debt_to_equity <= 200:
            _add("negative", 0.40, f"Moderate leverage: D/E {fin.debt_to_equity:.0f}%")
        elif fin.debt_to_equity and 50 <= fin.debt_to_equity <= 100:
            _add("positive", 0.40, f"Manageable leverage: D/E {fin.debt_to_equity:.0f}%")

        # Liquidity
        if fin.current_ratio is not None and fin.current_ratio < 1.0:
            _add("negative", 0.55, f"Liquidity concern: current ratio {fin.current_ratio:.2f}")
        elif fin.current_ratio is not None and fin.current_ratio > 2.0:
            _add("positive", 0.45, f"Strong liquidity: current ratio {fin.current_ratio:.2f}")

        # FCF
        if fin.fcf is not None:
            if fin.fcf < 0:
                _add("negative", 0.60, "Negative free cash flow -- burning cash")
            elif fin.fcf > 0 and fin.revenue and fin.fcf / fin.revenue > 0.15:
                fcf_margin = fin.fcf / fin.revenue * 100
                _add("positive", 0.60, f"Strong FCF margin of {fcf_margin:.1f}% -- cash generative business")

        # ROE
        if fin.roe is not None:
            if fin.roe > 0.20:
                _add("positive", 0.55, f"ROE of {fin.roe * 100:.1f}% -- strong returns on capital")
            elif fin.roe < 0:
                _add("negative", 0.55, f"Negative ROE ({fin.roe * 100:.1f}%) -- unprofitable")

        # Margins
        if fin.gross_margin is not None:
            if fin.gross_margin > 0.60:
                _add("positive", 0.50, f"Gross margin {fin.gross_margin * 100:.1f}% -- strong pricing power")
            elif fin.gross_margin < 0.20:
                _add("negative", 0.50, f"Low gross margin {fin.gross_margin * 100:.1f}% -- limited pricing power")

    return mappings


# ── Growth trajectory rules ────────────────────────────────────────────────

def _growth_rules(fin: FinancialHealthSignal, fund: FundamentalSignal | None, theses: list[dict]) -> list[ThesisSignalMapping]:
    mappings = []
    for t in theses:
        if t["category"] != "growth_trajectory":
            continue

        def _add(sentiment: str, confidence: float, summary: str) -> None:
            mappings.append(ThesisSignalMapping(
                thesis_id=t["id"],
                category=t["category"],
                statement=t["statement"],
                sentiment=sentiment,
                confidence=confidence,
                signal_summary=summary,
            ))

        rev_growth = fin.revenue_growth if fin else None
        if rev_growth is None and fund:
            rev_growth = fund.revenue_growth

        if rev_growth is not None:
            if rev_growth > 0.20:
                _add("positive", 0.65, f"Revenue growing {rev_growth * 100:.1f}% YoY -- strong trajectory")
            elif 0.10 <= rev_growth <= 0.20:
                _add("positive", 0.50, f"Solid revenue growth at {rev_growth * 100:.1f}% YoY")
            elif 0.05 <= rev_growth < 0.10:
                pass  # 5-10%: neutral, no signal
            elif 0 < rev_growth < 0.05:
                _add("negative", 0.50, f"Revenue growth stalling at {rev_growth * 100:.1f}% YoY")
            elif rev_growth < 0:
                _add("negative", 0.65, f"Revenue declining {rev_growth * 100:.1f}% YoY")

        # Rule of 40
        if rev_growth is not None and fin and fin.operating_margin is not None:
            rule_of_40 = (rev_growth * 100) + (fin.operating_margin * 100)
            if rule_of_40 > 40:
                _add("positive", 0.60, f"Rule of 40 score: {rule_of_40:.0f} (growth {rev_growth * 100:.0f}% + margin {fin.operating_margin * 100:.0f}%)")
            elif rule_of_40 < 20:
                _add("negative", 0.55, f"Rule of 40 score: {rule_of_40:.0f} -- below threshold")

        # EPS beat/miss (extreme)
        if fund and fund.eps_beat is not None:
            if fund.eps_beat and fund.surprise_pct and fund.surprise_pct > 10:
                _add("positive", 0.55, f"EPS beat by {fund.surprise_pct:.1f}% -- execution on track")
            elif not fund.eps_beat and fund.surprise_pct and fund.surprise_pct < -10:
                _add("negative", 0.55, f"EPS missed by {abs(fund.surprise_pct):.1f}% -- growth execution concern")

        # EPS beat/miss (modest)
        if fund and fund.eps_beat is not None:
            if fund.eps_beat and fund.surprise_pct and 5 < fund.surprise_pct <= 10:
                _add("positive", 0.45, f"Modest EPS beat of {fund.surprise_pct:.1f}%")
            elif not fund.eps_beat and fund.surprise_pct and -10 <= fund.surprise_pct < -5:
                _add("negative", 0.45, f"Modest EPS miss of {abs(fund.surprise_pct):.1f}%")

    return mappings


# ── Ownership & conviction rules ──────────────────────────────────────────

def _ownership_rules(own: OwnershipSignal, insider: list[InsiderSignal], theses: list[dict]) -> list[ThesisSignalMapping]:
    mappings = []
    for t in theses:
        if t["category"] != "ownership_conviction":
            continue

        def _add(sentiment: str, confidence: float, summary: str) -> None:
            mappings.append(ThesisSignalMapping(
                thesis_id=t["id"],
                category=t["category"],
                statement=t["statement"],
                sentiment=sentiment,
                confidence=confidence,
                signal_summary=summary,
            ))

        # Short interest
        if own and own.short_pct_float is not None:
            if own.short_pct_float > 0.10:
                _add("negative", 0.60, f"Short interest {own.short_pct_float * 100:.1f}% of float -- significant bearish bets")
            elif own.short_pct_float < 0.02:
                _add("positive", 0.50, f"Low short interest ({own.short_pct_float * 100:.1f}%) -- minimal bearish sentiment")

        # Analyst consensus
        if own and own.recommendation:
            if own.recommendation in ("strong_buy", "buy"):
                count = f" ({own.analyst_count} analysts)" if own.analyst_count else ""
                _add("positive", 0.55, f"Analyst consensus: {own.recommendation.replace('_', ' ')}{count}")
            elif own.recommendation in ("sell", "strong_sell"):
                _add("negative", 0.55, f"Analyst consensus: {own.recommendation.replace('_', ' ')}")

        # Institutional ownership
        if own and own.institutional_pct is not None:
            if own.institutional_pct > 0.80:
                _add("positive", 0.50, f"High institutional ownership ({own.institutional_pct * 100:.1f}%) -- smart money conviction")
            elif own.institutional_pct < 0.20:
                _add("negative", 0.45, f"Low institutional ownership ({own.institutional_pct * 100:.1f}%) -- limited institutional interest")

        # Insider activity
        if insider:
            filing_count = len(insider)
            if filing_count >= 5:
                _add("neutral", 0.50, f"{filing_count} insider transactions in 90 days -- elevated activity")

    return mappings


# ── Competitive moat rules ────────────────────────────────────────────────

def _moat_rules(fin: FinancialHealthSignal, own: OwnershipSignal | None, theses: list[dict]) -> list[ThesisSignalMapping]:
    """Quantitative proxies for competitive moat strength."""
    mappings = []
    for t in theses:
        if t["category"] != "competitive_moat":
            continue

        def _add(sentiment: str, confidence: float, summary: str) -> None:
            mappings.append(ThesisSignalMapping(
                thesis_id=t["id"],
                category=t["category"],
                statement=t["statement"],
                sentiment=sentiment,
                confidence=confidence,
                signal_summary=summary,
            ))

        # Gross margin as pricing power proxy
        if fin and fin.gross_margin is not None:
            if fin.gross_margin > 0.60:
                _add("positive", 0.60, f"Gross margin {fin.gross_margin * 100:.1f}% -- strong pricing power")
            elif fin.gross_margin > 0.40:
                _add("positive", 0.40, f"Healthy gross margin of {fin.gross_margin * 100:.1f}%")
            elif fin.gross_margin < 0.25:
                _add("negative", 0.55, f"Low gross margin {fin.gross_margin * 100:.1f}% -- limited pricing power")

        # ROE as capital efficiency proxy
        if fin and fin.roe is not None:
            if fin.roe > 0.25:
                _add("positive", 0.50, f"ROE of {fin.roe * 100:.1f}% -- efficient capital deployment")
            elif fin.roe < 0:
                _add("negative", 0.50, f"Negative ROE ({fin.roe * 100:.1f}%) -- no economic moat visible")

        # Institutional conviction as moat recognition
        if own and own.institutional_pct is not None:
            if own.institutional_pct > 0.75:
                _add("positive", 0.45, f"{own.institutional_pct * 100:.1f}% institutional ownership -- moat recognized")
            elif own.institutional_pct < 0.15:
                _add("negative", 0.40, f"Low institutional interest at {own.institutional_pct * 100:.1f}%")

        # Operating margin as durable advantage indicator
        if fin and fin.operating_margin is not None:
            if fin.operating_margin > 0.25:
                _add("positive", 0.45, f"Operating margin {fin.operating_margin * 100:.1f}% -- durable advantage")
            elif fin.operating_margin < 0.05:
                _add("negative", 0.45, f"Thin operating margin of {fin.operating_margin * 100:.1f}%")

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

        return results
    except Exception as exc:
        logger.error("signal_interpreter: LLM news mapping failed: %s", exc)
        return []


# ── Merge & interpret ──────────────────────────────────────────────────────

def _merge_mappings(*mapping_lists: list[ThesisSignalMapping]) -> list[ThesisSignalMapping]:
    """Merge all mapping lists, deduplicating only on identical signal text.

    Multiple signals per thesis_id are preserved for diminishing-returns scoring
    in thesis_evaluator. Dedup only removes exact duplicate signal_summary strings
    to avoid inflation from the same fact hitting multiple rule functions.
    """
    seen: dict[str, ThesisSignalMapping] = {}
    all_mappings: list[ThesisSignalMapping] = []
    for maps in mapping_lists:
        for m in maps:
            key = (m.thesis_id, m.signal_summary.strip().lower())
            if key not in seen:
                seen[key] = m
                all_mappings.append(m)
    return all_mappings


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

    # Deterministic rules for all categories
    valuation_maps = _valuation_rules(signals.valuation, selected_theses)
    financial_maps = _financial_health_rules(signals.financial_health, selected_theses)
    growth_maps = _growth_rules(signals.financial_health, signals.fundamentals, selected_theses)
    ownership_maps = _ownership_rules(signals.ownership, signals.insider_transactions, selected_theses)
    moat_maps = _moat_rules(signals.financial_health, signals.ownership, selected_theses)
    filing_maps = _filing_rules(signals.recent_filings, selected_theses)

    return _merge_mappings(
        price_maps, news_maps, valuation_maps, financial_maps,
        growth_maps, ownership_maps, moat_maps, filing_maps,
    )
