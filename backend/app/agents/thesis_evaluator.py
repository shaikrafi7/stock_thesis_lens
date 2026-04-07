"""Thesis Evaluator agent — deterministic, no LLM.

Bidirectional scoring: base score of 50, positive signals add credit (up to +50),
negative signals deduct (up to -50). Final score clamped to [0, 100].

Category weights reflect investment importance. Point importance and frozen
status multiply the base weight, so critical/frozen conviction points carry
more scoring impact.
"""
from dataclasses import dataclass, field
from app.agents.signal_interpreter import ThesisSignalMapping

# Weights for negative signals (deduct from base 50)
CATEGORY_DEDUCTIONS: dict[str, float] = {
    "competitive_moat": 8.0,
    "growth_trajectory": 6.0,
    "valuation": 5.0,
    "financial_health": 5.0,
    "ownership_conviction": 4.0,
    "risks": 7.0,      # risk materialising = heavy deduction
}

# Weights for positive signals (credit added to base 50)
CATEGORY_CREDITS: dict[str, float] = {
    "competitive_moat": 8.0,
    "growth_trajectory": 6.0,
    "valuation": 5.0,
    "financial_health": 5.0,
    "ownership_conviction": 4.0,
    "risks": 4.0,      # risk not materialising = minor positive
}

# Importance multiplier applied to base category weight
IMPORTANCE_MULTIPLIER: dict[str, float] = {
    "standard": 1.0,
    "important": 1.5,
    "critical": 2.0,
}

# Frozen points get the same multiplier as critical
FROZEN_MULTIPLIER = 2.0

# Confidence threshold — only apply if signal is confident enough
CONFIDENCE_THRESHOLD = 0.45


@dataclass
class EvaluationResult:
    score: float
    status: str                       # "green" | "yellow" | "red"
    broken_points: list[dict]         # negative signals — serialisable for DB
    confirmed_points: list[dict] = field(default_factory=list)  # positive signals
    frozen_breaks: list[dict] = field(default_factory=list)     # frozen points that broke


def _adjust_weights(investor_profile: dict | None) -> tuple[dict, dict]:
    """Return per-profile adjusted copies of CATEGORY_DEDUCTIONS and CATEGORY_CREDITS."""
    deductions = CATEGORY_DEDUCTIONS.copy()
    credits = CATEGORY_CREDITS.copy()
    if not investor_profile:
        return deductions, credits
    if investor_profile.get("risk_capacity") == "low":
        deductions["risks"] *= 1.2
        deductions["financial_health"] *= 1.2
    if investor_profile.get("loss_aversion") == "high":
        deductions = {k: v * 1.15 for k, v in deductions.items()}
    if investor_profile.get("investment_style") == "growth":
        credits["growth_trajectory"] *= 1.2
    return deductions, credits


def evaluate_thesis(
    mappings: list[ThesisSignalMapping],
    thesis_meta: dict[int, dict] | None = None,
    investor_profile: dict | None = None,
) -> EvaluationResult:
    """Score the thesis based on signal mappings. Deterministic.

    Args:
        mappings: Signal-to-thesis mappings from the interpreter.
        thesis_meta: Optional dict mapping thesis_id to metadata:
            {"importance": "standard"|"important"|"critical", "frozen": bool}
    """
    meta = thesis_meta or {}
    base = 50.0
    total_credit = 0.0
    total_deduction = 0.0
    cat_deductions, cat_credits = _adjust_weights(investor_profile)
    broken_points = []
    confirmed_points = []
    frozen_breaks = []

    for m in mappings:
        if m.confidence < CONFIDENCE_THRESHOLD:
            continue

        # Look up importance and frozen status for this thesis point
        point_meta = meta.get(m.thesis_id, {})
        importance = point_meta.get("importance", "standard")
        is_frozen = point_meta.get("frozen", False)

        # Multiplier: frozen overrides importance (both get 2x)
        if is_frozen:
            multiplier = FROZEN_MULTIPLIER
        else:
            multiplier = IMPORTANCE_MULTIPLIER.get(importance, 1.0)

        if m.sentiment == "negative":
            deduction = cat_deductions.get(m.category, 3.0) * m.confidence * multiplier
            total_deduction += deduction
            point_data = {
                "thesis_id": m.thesis_id,
                "category": m.category,
                "statement": m.statement,
                "signal": m.signal_summary,
                "sentiment": m.sentiment,
                "deduction": round(deduction, 2),
            }
            broken_points.append(point_data)

            # Track frozen breaks separately for alert banner
            if is_frozen:
                frozen_breaks.append(point_data)

        elif m.sentiment == "positive":
            credit = cat_credits.get(m.category, 3.0) * m.confidence * multiplier
            total_credit += credit
            confirmed_points.append({
                "thesis_id": m.thesis_id,
                "category": m.category,
                "statement": m.statement,
                "signal": m.signal_summary,
                "sentiment": m.sentiment,
                "credit": round(credit, 2),
            })

    score = max(0.0, min(100.0, round(base + total_credit - total_deduction, 1)))

    if score >= 75:
        status = "green"
    elif score >= 50:
        status = "yellow"
    else:
        status = "red"

    return EvaluationResult(
        score=score,
        status=status,
        broken_points=broken_points,
        confirmed_points=confirmed_points,
        frozen_breaks=frozen_breaks,
    )
