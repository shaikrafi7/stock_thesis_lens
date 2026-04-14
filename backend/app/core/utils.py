"""Shared utility helpers."""


def get_investor_profile(user) -> dict | None:
    """Extract investor profile dict from a User model for passing to agents."""
    p = getattr(user, "investor_profile", None)
    if p is None or not p.wizard_completed:
        return None
    return {
        "investment_style": p.investment_style,
        "time_horizon": p.time_horizon,
        "loss_aversion": p.loss_aversion,
        "risk_capacity": p.risk_capacity,
        "experience_level": p.experience_level,
        "overconfidence_bias": p.overconfidence_bias,
        "primary_bias": p.primary_bias,
        "archetype_label": p.archetype_label,
    }
