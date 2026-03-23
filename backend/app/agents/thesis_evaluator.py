"""Thesis Evaluator agent — deterministic, no LLM.

Bidirectional scoring: base score of 50, positive signals add credit (up to +50),
negative signals deduct (up to -50). Final score clamped to [0, 100].

  Weights by category: core_beliefs > risks/leadership > strengths/catalysts
"""
from dataclasses import dataclass, field
from app.agents.signal_interpreter import ThesisSignalMapping

# Weights for negative signals (deduct from base 50)
CATEGORY_DEDUCTIONS: dict[str, float] = {
    "core_beliefs": 8.0,
    "risks": 6.0,
    "leadership": 6.0,
    "strengths": 4.5,
    "catalysts": 3.0,
}

# Weights for positive signals (credit added to base 50)
CATEGORY_CREDITS: dict[str, float] = {
    "core_beliefs": 8.0,
    "leadership": 6.0,
    "strengths": 5.0,
    "catalysts": 5.0,
    "risks": 4.0,   # risk not materialising = minor positive
}

# Confidence threshold — only apply if signal is confident enough
CONFIDENCE_THRESHOLD = 0.45


@dataclass
class EvaluationResult:
    score: float
    status: str                       # "green" | "yellow" | "red"
    broken_points: list[dict]         # negative signals — serialisable for DB
    confirmed_points: list[dict] = field(default_factory=list)  # positive signals


def evaluate_thesis(mappings: list[ThesisSignalMapping]) -> EvaluationResult:
    """Score the thesis based on signal mappings. Deterministic."""
    base = 50.0
    total_credit = 0.0
    total_deduction = 0.0
    broken_points = []
    confirmed_points = []

    for m in mappings:
        if m.confidence < CONFIDENCE_THRESHOLD:
            continue

        if m.sentiment == "negative":
            deduction = CATEGORY_DEDUCTIONS.get(m.category, 3.0) * m.confidence
            total_deduction += deduction
            broken_points.append({
                "thesis_id": m.thesis_id,
                "category": m.category,
                "statement": m.statement,
                "signal": m.signal_summary,
                "sentiment": m.sentiment,
                "deduction": round(deduction, 2),
            })

        elif m.sentiment == "positive":
            credit = CATEGORY_CREDITS.get(m.category, 3.0) * m.confidence
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
    )
