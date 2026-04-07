"""Investor profile content generation — derives archetype, behavioral summary,
scenario predictions, and bias fingerprint from wizard answers using GPT-4o."""
import json
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

PROFILE_SYSTEM_PROMPT = """You are a behavioral finance analyst. Given an investor's risk profile answers, generate a rich behavioral profile.

Return a JSON object with exactly these four keys:

1. "archetype_label" (string, 3-6 words): A memorable label for this investor type. E.g., "Conviction-Driven Growth Investor", "Cautious Value Seeker", "Patient Dividend Compounder".

2. "behavioral_summary" (string, 2-3 sentences): Describe their likely decision-making tendencies, dominant biases, and how they'll behave under stress. Be specific to their answers — not generic.

3. "scenario_predictions" (list of exactly 4 objects):
   Each object: {"situation": "...", "likely_action": "...", "watch_out_for": "..."}
   - situation: A concrete market or portfolio scenario this investor will face (e.g., "A stock in your portfolio drops 30% on missed earnings")
   - likely_action: What you predict this investor will do, based on their profile
   - watch_out_for: The specific behavioral pitfall they should be aware of in that moment

4. "bias_fingerprint" (object with exactly these 5 keys, each an integer 0-100):
   {"anchoring": N, "recency": N, "overconfidence": N, "loss_aversion": N, "herd": N}
   Score based on how strongly each bias likely affects this investor. 0 = minimal, 100 = very strong.

Be honest and specific. A useful profile names the investor's real tendencies, not flattering ones."""


def derive_primary_bias(answers: dict) -> str:
    """Deterministically compute primary bias from wizard answers."""
    loss_aversion = answers.get("loss_aversion", "medium")
    overconfidence = answers.get("overconfidence_bias", "medium")
    style = answers.get("investment_style", "blend")
    experience = answers.get("experience_level", "intermediate")

    if loss_aversion == "high":
        return "loss_aversion"
    if overconfidence == "high":
        return "overconfidence"
    if experience == "beginner":
        return "recency"
    if style == "growth":
        return "anchoring"
    return "none"


def generate_profile_content(answers: dict) -> dict:
    """Call GPT-4o to generate archetype, summary, scenarios, and bias fingerprint.

    Returns a dict with keys: archetype_label, behavioral_summary,
    scenario_predictions, bias_fingerprint.
    Falls back to sensible defaults on failure.
    """
    if not settings.OPENAI_API_KEY:
        return _fallback_content(answers)

    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.OPENAI_API_KEY)

        user_msg = (
            f"Investment style: {answers.get('investment_style', 'blend')}\n"
            f"Time horizon: {answers.get('time_horizon', 'medium')}\n"
            f"Loss aversion: {answers.get('loss_aversion', 'medium')}\n"
            f"Risk capacity: {answers.get('risk_capacity', 'medium')}\n"
            f"Experience level: {answers.get('experience_level', 'intermediate')}\n"
            f"Overconfidence bias: {answers.get('overconfidence_bias', 'medium')}\n"
            f"Primary bias: {answers.get('primary_bias', 'none')}\n"
        )

        response = client.chat.completions.create(
            model="gpt-4o",
            response_format={"type": "json_object"},
            temperature=0.4,
            max_tokens=800,
            messages=[
                {"role": "system", "content": PROFILE_SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
        )
        data = json.loads(response.choices[0].message.content or "{}")
        return _validate_content(data, answers)

    except Exception as exc:
        logger.error("profile_service: GPT-4o call failed: %s", exc)
        return _fallback_content(answers)


def _validate_content(data: dict, answers: dict) -> dict:
    """Ensure required fields exist; fill defaults for any missing."""
    result = {}

    result["archetype_label"] = data.get("archetype_label") or _default_archetype(answers)

    result["behavioral_summary"] = data.get("behavioral_summary") or (
        "Your profile suggests a balanced approach to investing. "
        "Focus on maintaining discipline during market volatility."
    )

    scenarios = data.get("scenario_predictions")
    if isinstance(scenarios, list) and len(scenarios) >= 2:
        result["scenario_predictions"] = scenarios[:4]
    else:
        result["scenario_predictions"] = _default_scenarios(answers)

    fingerprint = data.get("bias_fingerprint")
    if isinstance(fingerprint, dict) and len(fingerprint) >= 5:
        result["bias_fingerprint"] = {k: max(0, min(100, int(v))) for k, v in fingerprint.items()}
    else:
        result["bias_fingerprint"] = _default_fingerprint(answers)

    return result


def _default_archetype(answers: dict) -> str:
    style = answers.get("investment_style", "blend").capitalize()
    horizon = answers.get("time_horizon", "medium")
    horizon_label = {"short": "Tactical", "medium": "Balanced", "long": "Patient"}.get(horizon, "Balanced")
    return f"{horizon_label} {style} Investor"


def _default_scenarios(answers: dict) -> list[dict]:
    return [
        {
            "situation": "A stock in your portfolio drops 20% on weak earnings",
            "likely_action": "Review thesis to decide whether fundamentals have changed",
            "watch_out_for": "Anchoring to your original entry price rather than current fundamentals",
        },
        {
            "situation": "A high-growth stock you've researched doubles in a month",
            "likely_action": "Hesitate to add at the higher price, waiting for a pullback",
            "watch_out_for": "Recency bias from the run-up causing you to miss a sustained compounder",
        },
    ]


def _default_fingerprint(answers: dict) -> dict:
    loss_map = {"low": 25, "medium": 55, "high": 80}
    over_map = {"low": 20, "medium": 45, "high": 75}
    return {
        "anchoring": 50,
        "recency": 40,
        "overconfidence": over_map.get(answers.get("overconfidence_bias", "medium"), 45),
        "loss_aversion": loss_map.get(answers.get("loss_aversion", "medium"), 55),
        "herd": 30,
    }


def _fallback_content(answers: dict) -> dict:
    return {
        "archetype_label": _default_archetype(answers),
        "behavioral_summary": (
            "Your profile suggests a disciplined, thesis-driven approach. "
            "You tend to hold through short-term volatility when your conviction is intact. "
            "Watch for anchoring to original entry prices during prolonged drawdowns."
        ),
        "scenario_predictions": _default_scenarios(answers),
        "bias_fingerprint": _default_fingerprint(answers),
    }
