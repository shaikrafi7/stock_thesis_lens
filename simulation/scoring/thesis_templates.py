"""Standardized thesis templates for simulation — one per category per stock.

Using fixed templates isolates the question: 'do the scoring rules predict returns?'
without LLM noise or per-user thesis variation.
"""

THESIS_TEMPLATES = [
    {
        "id": 1,
        "category": "competitive_moat",
        "statement": "The company has a durable competitive advantage",
        "importance": "standard",
        "frozen": False,
        "conviction": None,
        "selected": True,
    },
    {
        "id": 2,
        "category": "growth_trajectory",
        "statement": "Revenue and earnings growth trajectory is strong",
        "importance": "standard",
        "frozen": False,
        "conviction": None,
        "selected": True,
    },
    {
        "id": 3,
        "category": "valuation",
        "statement": "The stock is reasonably valued relative to fundamentals",
        "importance": "standard",
        "frozen": False,
        "conviction": None,
        "selected": True,
    },
    {
        "id": 4,
        "category": "financial_health",
        "statement": "The balance sheet is sound with strong cash generation",
        "importance": "standard",
        "frozen": False,
        "conviction": None,
        "selected": True,
    },
    {
        "id": 5,
        "category": "ownership_conviction",
        "statement": "Institutional and insider ownership signals confidence",
        "importance": "standard",
        "frozen": False,
        "conviction": None,
        "selected": True,
    },
    {
        "id": 6,
        "category": "risks",
        "statement": "Key business risks are being monitored",
        "importance": "standard",
        "frozen": False,
        "conviction": None,
        "selected": True,
    },
]

THESIS_META: dict[int, dict] = {
    t["id"]: {"importance": t["importance"], "frozen": t["frozen"], "conviction": t["conviction"]}
    for t in THESIS_TEMPLATES
}
