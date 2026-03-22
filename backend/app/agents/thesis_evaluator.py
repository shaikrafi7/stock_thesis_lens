"""Thesis Evaluator agent — deterministic, no LLM.

Starts at 100 and deducts points based on negative signals mapped to
selected thesis bullets. Weights differ by category per the product spec:
  core_beliefs > leadership > risks > strengths > catalysts

Outputs a score (0–100), status (green/yellow/red), and broken_points list.
"""
from dataclasses import dataclass
from app.agents.signal_interpreter import ThesisSignalMapping

# Deduction per broken bullet by category
CATEGORY_DEDUCTIONS: dict[str, float] = {
    "core_beliefs": 15.0,
    "leadership": 10.0,
    "risks": 12.0,       # confirmed/materialising risk is bad
    "strengths": 8.0,
    "catalysts": 5.0,
}

# Confidence threshold — only deduct if signal is confident enough
CONFIDENCE_THRESHOLD = 0.45


@dataclass
class EvaluationResult:
    score: float
    status: str          # "green" | "yellow" | "red"
    broken_points: list[dict]  # serialisable list for DB storage


def evaluate_thesis(mappings: list[ThesisSignalMapping]) -> EvaluationResult:
    """Score the thesis based on signal mappings. Deterministic."""
    score = 100.0
    broken_points = []

    for m in mappings:
        if m.sentiment != "negative" or m.confidence < CONFIDENCE_THRESHOLD:
            continue

        deduction = CATEGORY_DEDUCTIONS.get(m.category, 5.0) * m.confidence
        score -= deduction

        broken_points.append({
            "thesis_id": m.thesis_id,
            "category": m.category,
            "statement": m.statement,
            "signal": m.signal_summary,
            "sentiment": m.sentiment,
            "deduction": round(deduction, 2),
        })

    score = max(0.0, round(score, 1))

    if score >= 75:
        status = "green"
    elif score >= 50:
        status = "yellow"
    else:
        status = "red"

    return EvaluationResult(score=score, status=status, broken_points=broken_points)
