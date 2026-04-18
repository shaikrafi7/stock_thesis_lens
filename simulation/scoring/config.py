"""Scoring configuration for simulation variants.

ScoringConfig threads regime-aware and sector-aware weight adjustments
into the backend scoring engine without modifying the engine's defaults.

A None or empty ScoringConfig reproduces v1 scoring exactly.
"""
import sys
from dataclasses import dataclass, field
from pathlib import Path
import json

_SIM_DIR = Path(__file__).parent.parent
_BACKEND = _SIM_DIR.parent / "backend"
_PROJECT_ROOT = _SIM_DIR.parent
for _p in [str(_BACKEND), str(_PROJECT_ROOT)]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

from app.agents.thesis_evaluator import CATEGORY_CREDITS, CATEGORY_DEDUCTIONS

_SP500_SECTORS_PATH = Path(__file__).parent.parent / "data" / "sp500_sectors.json"

# Regime key convention: "<trend>_<vol>" e.g., "bear_high", "bull_low"
# Set of 6 possible keys: {bull,bear,flat} x {high,low}
RegimeAdjustments = dict[str, dict[str, float]]
SectorAdjustments = dict[str, dict[str, float]]


@dataclass
class ScoringConfig:
    """Per-run scoring config. Each adjustment is a multiplier applied to
    the base category credit/deduction weights.

    regime_adjustments applies based on (trend, vol) at the score date.
    sector_adjustments applies based on the ticker's GICS sector.
    Adjustments compound multiplicatively when both apply.
    """
    regime_adjustments: RegimeAdjustments = field(default_factory=dict)
    sector_adjustments: SectorAdjustments = field(default_factory=dict)
    # Optional override of category_credits/deductions for ablation variants.
    category_credits_override: dict[str, float] | None = None
    category_deductions_override: dict[str, float] | None = None

    @property
    def is_noop(self) -> bool:
        """True if config is equivalent to v1 defaults."""
        return (
            not self.regime_adjustments
            and not self.sector_adjustments
            and self.category_credits_override is None
            and self.category_deductions_override is None
        )


_sector_cache: dict[str, str] | None = None


def sector_of(ticker: str) -> str | None:
    """Return GICS sector for a ticker, or None if unknown."""
    global _sector_cache
    if _sector_cache is None:
        if _SP500_SECTORS_PATH.exists():
            with _SP500_SECTORS_PATH.open() as f:
                _sector_cache = json.load(f)
        else:
            _sector_cache = {}
    return _sector_cache.get(ticker)


def resolve_weights(
    config: ScoringConfig | None,
    regime_key: str | None = None,
    sector: str | None = None,
) -> tuple[dict[str, float], dict[str, float]]:
    """Compute (credits, deductions) dicts for a given context.

    Applies in order:
      1. Start from global defaults (or overrides if provided).
      2. Multiply by regime adjustments.
      3. Multiply by sector adjustments.
    """
    if config is None:
        return CATEGORY_CREDITS.copy(), CATEGORY_DEDUCTIONS.copy()

    credits = (
        config.category_credits_override.copy()
        if config.category_credits_override is not None
        else CATEGORY_CREDITS.copy()
    )
    deductions = (
        config.category_deductions_override.copy()
        if config.category_deductions_override is not None
        else CATEGORY_DEDUCTIONS.copy()
    )

    if regime_key and regime_key in config.regime_adjustments:
        for cat, mult in config.regime_adjustments[regime_key].items():
            if cat in credits:
                credits[cat] *= mult
            if cat in deductions:
                deductions[cat] *= mult

    if sector and sector in config.sector_adjustments:
        for cat, mult in config.sector_adjustments[sector].items():
            if cat in credits:
                credits[cat] *= mult
            if cat in deductions:
                deductions[cat] *= mult

    return credits, deductions


# ---- v2 presets (informed by 2020-2024 backtest Run 5-6) ----

# Regime keys are "<trend>_<vol>": e.g. bear_high, bull_low, flat_high.
# Rationale: in bear+high-vol periods the v1 score was worst (L/S -13%).
# Growth signals mislead during stress rallies; financial_health + risks
# + ownership_conviction hold more information in those windows. Bull
# regimes retain v1 growth tilt; flat is near-neutral.
V2_REGIME_ADJUSTMENTS: RegimeAdjustments = {
    "bear_high": {
        "growth_trajectory": 0.5,
        "valuation": 0.7,
        "financial_health": 1.4,
        "risks": 1.3,
        "ownership_conviction": 1.2,
    },
    "bear_low": {
        "growth_trajectory": 0.7,
        "financial_health": 1.3,
        "risks": 1.2,
    },
    "flat_high": {
        "growth_trajectory": 0.8,
        "financial_health": 1.2,
        "risks": 1.15,
    },
    "flat_low": {},
    "bull_high": {
        "financial_health": 1.1,
    },
    "bull_low": {
        "growth_trajectory": 1.15,
        "competitive_moat": 1.1,
    },
}

# Sector keys are GICS sector names from sp500_sectors.json.
# Rationale: Consumer Staples showed IC -0.129 in Run 6 — uniform weights
# clearly wrong. Utilities/Real Estate are interest-rate-sensitive, not
# growth stories. Communication Services had the only positive IC.
V2_SECTOR_ADJUSTMENTS: SectorAdjustments = {
    "Consumer Staples": {
        "growth_trajectory": 0.4,
        "valuation": 0.6,
        "financial_health": 1.4,
        "ownership_conviction": 1.2,
    },
    "Utilities": {
        "growth_trajectory": 0.5,
        "valuation": 0.7,
        "financial_health": 1.3,
    },
    "Real Estate": {
        "growth_trajectory": 0.6,
        "financial_health": 1.3,
    },
    "Information Technology": {
        "competitive_moat": 1.1,
    },
    "Communication Services": {
        "growth_trajectory": 1.15,
        "competitive_moat": 1.15,
    },
}


def v2_config() -> ScoringConfig:
    """Return the v2 preset: regime- and sector-aware weight adjustments."""
    return ScoringConfig(
        regime_adjustments=dict(V2_REGIME_ADJUSTMENTS),
        sector_adjustments=dict(V2_SECTOR_ADJUSTMENTS),
    )


def regime_key_from(trend: str, vol: str) -> str:
    """Build the regime key matching V2_REGIME_ADJUSTMENTS keys."""
    return f"{trend}_{vol}"
