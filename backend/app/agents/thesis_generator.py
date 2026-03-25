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

Your job: build a structured investment thesis from the BUYER'S PERSPECTIVE — what does the investor need to see to be confident in this investment?

Return a JSON object with exactly these six keys:
  competitive_moat, growth_trajectory, valuation, financial_health, ownership_conviction, risks

Each key maps to a list of 3-5 objects with this format:
  {"statement": "...", "importance": "standard|important|critical"}

CATEGORY GUIDELINES:

competitive_moat — Durable competitive advantages
  Focus on: network effects, switching costs, brand power, scale advantages, IP/patents, flywheel dynamics, business model clarity, market position
  Reference: Buffett's "economic moat", Helmer's 7 Powers, Dorsey's moat framework

growth_trajectory — Growth potential and trajectory
  Focus on: revenue/earnings growth rate, total addressable market (TAM), product pipeline, market share trends, Rule of 40 (for SaaS/tech), organic growth drivers
  Be specific with numbers when available (e.g., "Revenue growing 25% YoY with TAM expanding to $X")

valuation — Is the price right?
  Focus on: P/E relative to growth (PEG), EV/EBITDA vs peers, price-to-sales, margin of safety, historical valuation bands, premium/discount to sector
  Reference actual metrics when available

financial_health — Balance sheet and cash flow quality
  Focus on: free cash flow generation, debt levels, profitability margins (gross/operating/net), return on equity, capital allocation quality (buybacks, dividends, M&A track record)
  Be specific: "Generates $X FCF annually with debt-to-equity of Y"

ownership_conviction — Smart money signals
  Focus on: insider ownership level + recent buying/selling, institutional ownership level, analyst consensus and target prices, short interest level
  Note: elevated insider buying is bullish, elevated short interest is a warning

risks — Bear case and threats
  Focus on: regulatory/legal exposure, competitive disruption risk, customer/revenue concentration, macro sensitivity, key person risk, execution risk, technology obsolescence
  Frame as specific threats, not generic warnings

RULES:
- Each statement must be a complete, standalone sentence under 25 words
- Frame from the BUYER'S perspective: what you need to believe for this investment to work
- Be specific and data-grounded — reference actual metrics, competitors, or events
- For importance: "critical" = must-have for the thesis (1-2 per category max), "important" = key factor, "standard" = supporting point
- Be honest about risks — a strong bear case makes the thesis more credible
- No buy/sell recommendations"""


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


def _call_openai(ticker: str, company_name: str, profile: dict | None = None, financials: dict | None = None) -> dict:
    from openai import OpenAI

    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    user_prompt = _build_user_prompt(ticker, company_name, profile or {}, financials)
    response = client.chat.completions.create(
        model="gpt-4o",
        response_format={"type": "json_object"},
        temperature=0.3,
        max_tokens=2000,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    )
    raw = response.choices[0].message.content or "{}"
    return json.loads(raw)


IMPORTANCE_WEIGHTS = {"critical": 2.0, "important": 1.5, "standard": 1.0}


def _parse_bullets(data: dict) -> list[GeneratedThesis]:
    results = []
    for category in CATEGORIES:
        items = data.get(category, [])
        if not isinstance(items, list):
            continue
        for item in items[:5]:
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
            if statement:
                results.append(GeneratedThesis(
                    category=category,
                    statement=statement,
                    weight=IMPORTANCE_WEIGHTS.get(importance, 1.0),
                    importance=importance,
                ))
    return results


def generate_thesis(ticker: str, company_name: str) -> list[GeneratedThesis]:
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
                data = traced_call(ticker, company_name, profile, financials)
            except Exception:
                data = _call_openai(ticker, company_name, profile, financials)
        else:
            data = _call_openai(ticker, company_name, profile, financials)

        results = _parse_bullets(data)
        if results:
            return results

        logger.warning("thesis_generator: OpenAI returned empty bullets for %s, using fallback", ticker)
        return _parse_bullets(FALLBACK_THESIS)

    except Exception as exc:
        logger.error("thesis_generator: OpenAI call failed for %s (%s), using fallback", ticker, exc)
        return _parse_bullets(FALLBACK_THESIS)
