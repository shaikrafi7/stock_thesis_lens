"""LLM output quality gate — deterministic checks, no LLM calls."""
import logging
import re
from datetime import datetime

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

VALID_IMPACTS = {"bullish", "bearish", "neutral"}

FILLER_PHRASES = [
    "the company is good",
    "this is a good company",
    "this stock is good",
    "very good company",
    "great company",
    "solid company",
    "nice company",
    "the company looks good",
    "the stock looks good",
]

PROFANITY = [
    "fuck", "shit", "crap", "damn", "asshole", "bastard", "bitch",
    "wtf", "stfu", "piss",
]

BUY_SELL_PATTERNS = re.compile(
    r"\b(buy|sell|short|go long|go short|purchase this stock|"
    r"recommend buying|recommend selling|time to buy|time to sell)\b",
    re.IGNORECASE,
)

FUTURE_DATE_PATTERN = re.compile(
    r"\b(20[3-9]\d|2[1-9]\d{2})\b"  # years 2030+ or 2100+
)

# Unrealistically large dollar amounts (>$100 trillion)
HUGE_DOLLAR_PATTERN = re.compile(
    r"\$\s*(\d[\d,]*)\s*(trillion|T)\b", re.IGNORECASE
)

# Category keyword sets — used for cross-sector checks
CATEGORY_KEYWORDS: dict[str, set[str]] = {
    "competitive_moat": {"moat", "advantage", "competitor", "brand", "network", "switching", "scale", "ip", "patent", "market share"},
    "growth_trajectory": {"growth", "revenue", "tam", "market", "expand", "rate", "trajectory", "catalyst", "acceleration"},
    "valuation": {"p/e", "pe", "ev", "ebitda", "price", "multiple", "valuation", "margin of safety", "cheap", "expensive", "discount"},
    "financial_health": {"cash", "debt", "balance sheet", "fcf", "free cash flow", "liquidity", "equity", "capital", "buyback", "dividend"},
    "ownership_conviction": {"insider", "institutional", "analyst", "target", "short interest", "ownership", "conviction"},
    "risks": {"risk", "threat", "regulatory", "macro", "competition", "execution", "disruption", "lawsuit", "uncertainty"},
}

# Sector-to-keyword mapping for cross-sector attribution detection
SECTOR_KEYWORDS: dict[str, set[str]] = {
    "energy": {"oil", "gas", "crude", "barrel", "opec", "refinery", "pipeline", "lng", "petroleum", "fossil"},
    "healthcare": {"drug", "fda", "clinical", "trial", "pharma", "biotech", "hospital", "medical", "patient", "therapy"},
    "technology": {"software", "chip", "semiconductor", "cloud", "ai", "data center", "saas", "platform", "algorithm"},
    "financials": {"bank", "loan", "interest rate", "fed", "credit", "mortgage", "insurance", "capital markets"},
    "consumer": {"retail", "consumer", "spending", "brand", "store", "e-commerce", "demand", "household"},
    "industrials": {"manufacturing", "supply chain", "aerospace", "defense", "logistics", "infrastructure"},
    "utilities": {"utility", "electricity", "power grid", "renewable", "solar", "wind"},
    "real estate": {"reit", "property", "rent", "real estate", "housing", "occupancy"},
    "materials": {"steel", "aluminum", "copper", "mining", "commodity", "chemical"},
    "communication": {"media", "streaming", "advertising", "telecom", "broadband", "5g", "social"},
}


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _contains_profanity(text: str) -> bool:
    lower = text.lower()
    return any(word in lower for word in PROFANITY)


def _contains_buy_sell(text: str) -> bool:
    return bool(BUY_SELL_PATTERNS.search(text))


def _contains_fabricated_dollar(text: str) -> bool:
    """Reject dollar amounts over $100 trillion — almost certainly hallucinated."""
    for m in HUGE_DOLLAR_PATTERN.finditer(text):
        raw = m.group(1).replace(",", "")
        try:
            if int(raw) > 100:  # >$100 trillion
                return True
        except ValueError:
            pass
    return False


def _contains_future_date(text: str) -> bool:
    return bool(FUTURE_DATE_PATTERN.search(text))


def _run_general_checks(text: str) -> str | None:
    """Return a rejection reason string, or None if all checks pass."""
    if _contains_profanity(text):
        return "profanity detected"
    if _contains_buy_sell(text):
        return "contains buy/sell recommendation"
    if _contains_fabricated_dollar(text):
        return "contains unrealistically large dollar amount"
    if _contains_future_date(text):
        return "contains far-future date"
    return None


# ---------------------------------------------------------------------------
# Thesis point checker
# ---------------------------------------------------------------------------

def check_thesis_point(
    statement: str,
    category: str,
    existing_statements: list[str] | None = None,
) -> tuple[bool, str | None]:
    """Check a single thesis point for quality.

    Returns (passes, reason). reason is None when the point passes.
    """
    if len(statement) < 15:
        return False, "too short (< 15 chars)"

    if len(statement) > 200:
        return False, "too long (> 200 chars)"

    lower = statement.lower()

    for filler in FILLER_PHRASES:
        if filler in lower:
            return False, f"generic filler phrase: '{filler}'"

    # Category relevance — at least one keyword must appear
    keywords = CATEGORY_KEYWORDS.get(category, set())
    if keywords and not any(kw in lower for kw in keywords):
        return False, f"statement does not relate to category '{category}'"

    # Near-duplicate detection against existing statements
    if existing_statements:
        words = set(re.findall(r"[a-z]{4,}", lower))
        nums = set(re.findall(r"\d+\.?\d*", lower))
        for existing in existing_statements:
            ex_lower = existing.lower()
            ex_words = set(re.findall(r"[a-z]{4,}", ex_lower))
            ex_nums = set(re.findall(r"\d+\.?\d*", ex_lower))
            all_words = words | ex_words
            if all_words:
                overlap = len(words & ex_words) / len(all_words)
                if overlap >= 0.6 and (nums & ex_nums):
                    return False, "near-duplicate of an existing thesis point"

    reason = _run_general_checks(statement)
    if reason:
        return False, reason

    return True, None


# ---------------------------------------------------------------------------
# Briefing item checker
# ---------------------------------------------------------------------------

def _detect_sector(text: str) -> str | None:
    """Return the first sector whose keywords appear in text, or None."""
    lower = text.lower()
    for sector, kws in SECTOR_KEYWORDS.items():
        if any(kw in lower for kw in kws):
            return sector
    return None


def check_briefing_item(
    item: dict,
    portfolio_tickers: list[str],
) -> tuple[bool, str | None]:
    """Check a parsed briefing item for quality.

    Returns (passes, reason).
    """
    ticker = (item.get("ticker") or "").upper().strip()
    headline = (item.get("headline") or "").strip()
    impact = (item.get("impact") or "").strip()
    source_url = (item.get("source_url") or "").strip()

    if not ticker:
        return False, "ticker is empty"

    if ticker != "MACRO" and ticker not in [t.upper() for t in portfolio_tickers]:
        return False, f"ticker {ticker!r} not in portfolio"

    if not headline:
        return False, "headline is empty"

    if impact not in VALID_IMPACTS:
        return False, f"impact {impact!r} is not in {VALID_IMPACTS}"

    if not source_url or not source_url.startswith("http"):
        return False, "source_url is missing or invalid"

    # Suggestion validation
    suggestion = item.get("suggestion")
    if isinstance(suggestion, dict):
        stmt = (suggestion.get("statement") or "").strip()
        if len(stmt) < 10:
            return False, "suggestion statement too vague (< 10 chars)"
        reason = _run_general_checks(stmt)
        if reason:
            return False, f"suggestion: {reason}"

    # Cross-sector attribution check: if the stock has a known sector,
    # verify the headline isn't clearly about a different sector.
    stock_sector = (item.get("sector") or "").lower()
    if stock_sector and ticker != "MACRO":
        headline_sector = _detect_sector(headline)
        if headline_sector and headline_sector != stock_sector:
            return False, (
                f"cross-sector attribution: headline appears to be about "
                f"'{headline_sector}' but ticker {ticker!r} is in '{stock_sector}'"
            )

    reason = _run_general_checks(headline)
    if reason:
        return False, f"headline: {reason}"

    return True, None


# ---------------------------------------------------------------------------
# Explanation checker
# ---------------------------------------------------------------------------

def check_explanation(text: str, score: float) -> tuple[bool, str | None]:
    """Check a score explanation for quality.

    Returns (passes, reason).
    """
    if len(text) < 50:
        return False, "too short (< 50 chars)"

    lower = text.lower()

    # Contradiction: says "strong" but score is weak
    strong_words = {"strong", "excellent", "outstanding", "robust", "exceptional"}
    if any(w in lower for w in strong_words) and score < 40:
        return False, f"contradiction: uses positive language but score is {score:.0f}"

    # Contradiction: says "weak" but score is high
    weak_words = {"weak", "poor", "terrible", "disappointing", "struggling"}
    if any(w in lower for w in weak_words) and score > 70:
        return False, f"contradiction: uses negative language but score is {score:.0f}"

    reason = _run_general_checks(text)
    if reason:
        return False, reason

    return True, None
