import json
import logging
from dataclasses import dataclass, field

from app.core.config import settings

logger = logging.getLogger(__name__)

CATEGORIES = [
    "competitive_moat", "growth_trajectory", "valuation",
    "financial_health", "ownership_conviction", "risks",
]

FALLBACK_THESIS: dict[str, list[dict]] = {
    "competitive_moat": [{"statement": "[Add a competitive advantage or moat observation]", "importance": "standard"}],
    "growth_trajectory": [{"statement": "[Add a growth trajectory observation]", "importance": "standard"}],
    "valuation": [{"statement": "[Add a valuation observation]", "importance": "standard"}],
    "financial_health": [{"statement": "[Add a financial health observation]", "importance": "standard"}],
    "ownership_conviction": [{"statement": "[Add an ownership or conviction signal]", "importance": "standard"}],
    "risks": [{"statement": "[Add a key risk to monitor]", "importance": "standard"}],
}

SYSTEM_PROMPT = """You are a buy-side investment research analyst helping a long-term investor evaluate whether to invest in a stock for 1+ years.

{investor_profile_block}
Your job: build a structured investment thesis from the BUYER'S PERSPECTIVE — what does the investor need to see to be confident in this investment?

Return a JSON object with exactly these six keys:
  competitive_moat, growth_trajectory, valuation, financial_health, ownership_conviction, risks

Each key maps to a list of exactly 3 objects with this format:
  {{"statement": "...", "importance": "standard|important|critical"}}

CATEGORY GUIDELINES (each category has 3 required sub-topics — write exactly one point per sub-topic):

competitive_moat — Durable competitive advantages
  Sub-topics: (1) source of moat (network effects, switching costs, brand, scale, IP), (2) durability/defensibility of the moat, (3) competitive positioning vs specific named rivals
  Reference: Buffett's "economic moat", Helmer's 7 Powers, Dorsey's moat framework

growth_trajectory — Growth potential and trajectory
  Sub-topics: (1) current growth rate with specific numbers, (2) forward growth driver or catalyst, (3) TAM size or market expansion opportunity
  Be specific with numbers when available (e.g., "Revenue growing 25% YoY with TAM expanding to $X")

valuation — Is the price right?
  Sub-topics: (1) absolute valuation metric (P/E, EV/EBITDA, P/S), (2) relative valuation vs peers or sector, (3) margin of safety or risk/reward assessment
  Reference actual metrics when available

financial_health — Balance sheet and cash flow quality
  Sub-topics: (1) cash flow quality (FCF generation, FCF margin), (2) balance sheet strength (debt levels, liquidity), (3) capital allocation track record (buybacks, dividends, M&A)
  Be specific: "Generates $X FCF annually with debt-to-equity of Y"

ownership_conviction — Smart money signals
  Sub-topics: (1) insider ownership level + recent buying/selling activity, (2) institutional ownership positioning, (3) analyst consensus and price targets
  Note: elevated insider buying is bullish, elevated short interest is a warning

risks — Bear case and threats
  Sub-topics: (1) business or competitive disruption risk, (2) macro, regulatory, or legal risk, (3) execution or operational risk
  Frame as specific threats, not generic warnings

RULES:
- Each statement must be a complete, standalone sentence under 25 words
- Frame from the BUYER'S perspective: what you need to believe for this investment to work
- Be specific and data-grounded — reference actual metrics, competitors, or events
- For importance: "critical" = must-have for the thesis (1-2 per category max), "important" = key factor, "standard" = supporting point
- Be honest about risks — a strong bear case makes the thesis more credible
- No buy/sell recommendations
- ZERO OVERLAP: Each statement must reference a unique fact, metric, or insight not mentioned in ANY other category. If a metric (e.g., margins, market share) is relevant to multiple categories, assign it to the single MOST relevant category only.
- WITHIN-CATEGORY DIVERSITY: The 3 points in each category must each address a different sub-topic as specified above. Never repeat the same metric or concept across points in one category.
- CROSS-CHECK before responding: review all 18 statements and eliminate any that overlap with another statement's core claim."""


@dataclass
class GeneratedThesis:
    category: str
    statement: str
    weight: float = field(default=1.0)
    importance: str = field(default="standard")


def _build_user_prompt(ticker: str, company_name: str, profile: dict, financials: dict | None = None) -> str:
    parts = [f"Build a buyer's investment thesis for {ticker} ({company_name})."]

    if profile:
        parts.append("\nCompany context:")
        if profile.get("sector"):
            parts.append(f"- Sector: {profile['sector']}")
        if profile.get("industry"):
            parts.append(f"- Industry: {profile['industry']}")
        if profile.get("mkt_cap"):
            mc = profile["mkt_cap"]
            parts.append(f"- Market Cap: ${mc:,.0f}" if isinstance(mc, (int, float)) else f"- Market Cap: {mc}")
        if profile.get("ceo"):
            parts.append(f"- CEO: {profile['ceo']}")
        if profile.get("description"):
            parts.append(f"- Business: {profile['description'][:600]}")

    if financials:
        parts.append("\nFinancial snapshot:")
        for key, val in financials.items():
            if val is not None:
                parts.append(f"- {key}: {val}")

    parts.append("\nBase the thesis ONLY on the actual business and data provided. Be specific.")
    return "\n".join(parts)


def _get_financial_context(ticker: str) -> dict | None:
    """Fetch key financial metrics from yfinance for thesis generation context."""
    try:
        import yfinance as yf
        info = yf.Ticker(ticker).info
        ctx = {}
        mappings = {
            "P/E (trailing)": "trailingPE",
            "P/E (forward)": "forwardPE",
            "PEG Ratio": "pegRatio",
            "EV/EBITDA": "enterpriseToEbitda",
            "Price/Sales": "priceToSalesTrailing12Months",
            "Price/Book": "priceToBook",
            "Gross Margin": "grossMargins",
            "Operating Margin": "operatingMargins",
            "Profit Margin": "profitMargins",
            "ROE": "returnOnEquity",
            "Debt/Equity": "debtToEquity",
            "Revenue Growth": "revenueGrowth",
            "Institutional Ownership": "heldPercentInstitutions",
            "Insider Ownership": "heldPercentInsiders",
            "Short % of Float": "shortPercentOfFloat",
            "Analyst Target Price": "targetMeanPrice",
            "Analyst Count": "numberOfAnalystOpinions",
            "Recommendation": "recommendationKey",
        }
        for label, key in mappings.items():
            val = info.get(key)
            if val is not None:
                if isinstance(val, float):
                    if "margin" in label.lower() or "ownership" in label.lower() or "growth" in label.lower() or "short" in label.lower() or "roe" in label.lower():
                        ctx[label] = f"{val * 100:.1f}%" if abs(val) < 10 else f"{val:.1f}%"
                    else:
                        ctx[label] = f"{val:.2f}"
                else:
                    ctx[label] = str(val)
        return ctx if ctx else None
    except Exception as exc:
        logger.error("thesis_generator: yfinance context fetch failed for %s: %s", ticker, exc)
        return None


def _build_investor_profile_block(investor_profile: dict | None) -> str:
    if not investor_profile:
        return ""
    style = investor_profile.get("investment_style", "")
    horizon = investor_profile.get("time_horizon", "")
    risk_cap = investor_profile.get("risk_capacity", "")
    loss_av = investor_profile.get("loss_aversion", "")
    archetype = investor_profile.get("archetype_label", "")

    hints = {
        "growth": "Emphasize runway, TAM expansion, and revenue growth trajectory.",
        "value": "Emphasize valuation margin of safety, ROIC, and free cash flow quality.",
        "dividend": "Emphasize dividend sustainability, payout ratio, and balance sheet stability.",
        "blend": "Balance growth potential with valuation discipline.",
    }
    horizon_hints = {
        "short": "Focus on near-term catalysts and current momentum.",
        "medium": "Balance near-term catalysts with 2-3 year business trajectory.",
        "long": "Emphasize durable competitive advantages and multi-year compounding potential.",
    }
    lines = ["Investor Profile Context:"]
    if archetype:
        lines.append(f"- Archetype: {archetype}")
    if style:
        lines.append(f"- Investment style: {style}. {hints.get(style, '')}")
    if horizon:
        lines.append(f"- Time horizon: {horizon}. {horizon_hints.get(horizon, '')}")
    if risk_cap == "low":
        lines.append("- Low risk capacity: be especially rigorous about financial health and downside risks.")
    if loss_av == "high":
        lines.append("- High loss aversion: clearly articulate the bear case so this investor can make an informed decision.")
    lines.append("")
    return "\n".join(lines)


def _call_openai(ticker: str, company_name: str, profile: dict | None = None, financials: dict | None = None, investor_profile: dict | None = None) -> dict:
    from openai import OpenAI

    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    user_prompt = _build_user_prompt(ticker, company_name, profile or {}, financials)
    profile_block = _build_investor_profile_block(investor_profile)
    system = SYSTEM_PROMPT.format(investor_profile_block=profile_block)
    response = client.chat.completions.create(
        model="gpt-4o",
        response_format={"type": "json_object"},
        temperature=0.3,
        max_tokens=2000,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_prompt},
        ],
    )
    raw = response.choices[0].message.content or "{}"
    return json.loads(raw)


IMPORTANCE_WEIGHTS = {"critical": 2.0, "important": 1.5, "standard": 1.0}


def _is_duplicate(stmt: str, existing: list[str], threshold: float = 0.6) -> bool:
    """Check if a statement is too similar to any existing statement."""
    import re
    # Extract key numbers and metric words for comparison
    stmt_lower = stmt.lower()
    stmt_nums = set(re.findall(r"\d+\.?\d*", stmt_lower))
    stmt_words = set(re.findall(r"[a-z]{4,}", stmt_lower))

    for existing_stmt in existing:
        ex_lower = existing_stmt.lower()
        ex_nums = set(re.findall(r"\d+\.?\d*", ex_lower))
        ex_words = set(re.findall(r"[a-z]{4,}", ex_lower))

        # If they share the same specific numbers AND similar words, it's a duplicate
        shared_nums = stmt_nums & ex_nums
        shared_words = stmt_words & ex_words
        all_words = stmt_words | ex_words

        if shared_nums and len(shared_nums) >= 1 and all_words:
            word_overlap = len(shared_words) / len(all_words)
            if word_overlap >= threshold:
                return True
    return False


def _parse_bullets(data: dict, existing_statements: list[str] | None = None) -> list[GeneratedThesis]:
    results = []
    seen_statements: list[str] = list(existing_statements or [])
    for category in CATEGORIES:
        items = data.get(category, [])
        if not isinstance(items, list):
            continue
        for item in items[:3]:
            if isinstance(item, dict):
                statement = item.get("statement", "").strip()
                importance = item.get("importance", "standard")
                if importance not in IMPORTANCE_WEIGHTS:
                    importance = "standard"
            elif isinstance(item, str):
                statement = item.strip()
                importance = "standard"
            else:
                continue
            if statement and not _is_duplicate(statement, seen_statements):
                results.append(GeneratedThesis(
                    category=category,
                    statement=statement,
                    weight=IMPORTANCE_WEIGHTS.get(importance, 1.0),
                    importance=importance,
                ))
                seen_statements.append(statement)
    return results


def generate_thesis(ticker: str, company_name: str, investor_profile: dict | None = None, existing_statements: list[str] | None = None) -> list[GeneratedThesis]:
    """Generate structured thesis bullets for a stock.

    Returns placeholder bullets if the OpenAI call fails.
    """
    try:
        from app.utils.fmp import get_company_profile
        profile = get_company_profile(ticker)
    except Exception:
        profile = {}

    financials = _get_financial_context(ticker)

    try:
        if settings.LANGCHAIN_TRACING_V2.lower() == "true" and settings.LANGSMITH_API_KEY:
            try:
                from langsmith import traceable
                traced_call = traceable(name="thesis_generator", run_type="llm")(_call_openai)
                data = traced_call(ticker, company_name, profile, financials, investor_profile)
            except Exception:
                data = _call_openai(ticker, company_name, profile, financials, investor_profile)
        else:
            data = _call_openai(ticker, company_name, profile, financials, investor_profile)

        results = _parse_bullets(data, existing_statements)
        if results:
            return results

        logger.warning("thesis_generator: OpenAI returned empty bullets for %s, using fallback", ticker)
        return _parse_bullets(FALLBACK_THESIS, existing_statements)

    except Exception as exc:
        logger.error("thesis_generator: OpenAI call failed for %s (%s), using fallback", ticker, exc)
        return _parse_bullets(FALLBACK_THESIS, existing_statements)
