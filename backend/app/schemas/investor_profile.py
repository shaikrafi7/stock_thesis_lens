from typing import Any, Optional
from pydantic import BaseModel, field_validator


VALID_STYLES = {"value", "growth", "dividend", "blend"}
VALID_HORIZONS = {"short", "medium", "long"}
VALID_LEVELS = {"low", "medium", "high"}
VALID_EXPERIENCE = {"beginner", "intermediate", "advanced"}


class InvestorProfileCreate(BaseModel):
    investment_style: str
    time_horizon: str
    loss_aversion: str
    risk_capacity: str
    experience_level: str
    overconfidence_bias: Optional[str] = None

    @field_validator("investment_style")
    @classmethod
    def validate_style(cls, v: str) -> str:
        if v not in VALID_STYLES:
            raise ValueError(f"investment_style must be one of {VALID_STYLES}")
        return v

    @field_validator("time_horizon")
    @classmethod
    def validate_horizon(cls, v: str) -> str:
        if v not in VALID_HORIZONS:
            raise ValueError(f"time_horizon must be one of {VALID_HORIZONS}")
        return v

    @field_validator("loss_aversion", "risk_capacity")
    @classmethod
    def validate_level(cls, v: str) -> str:
        if v not in VALID_LEVELS:
            raise ValueError(f"must be one of {VALID_LEVELS}")
        return v

    @field_validator("experience_level")
    @classmethod
    def validate_experience(cls, v: str) -> str:
        if v not in VALID_EXPERIENCE:
            raise ValueError(f"experience_level must be one of {VALID_EXPERIENCE}")
        return v

    @field_validator("overconfidence_bias")
    @classmethod
    def validate_overconfidence(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_LEVELS:
            raise ValueError(f"overconfidence_bias must be one of {VALID_LEVELS}")
        return v


class InvestorProfileRead(BaseModel):
    id: int
    user_id: int
    investment_style: Optional[str] = None
    time_horizon: Optional[str] = None
    loss_aversion: Optional[str] = None
    risk_capacity: Optional[str] = None
    experience_level: Optional[str] = None
    overconfidence_bias: Optional[str] = None
    primary_bias: Optional[str] = None
    archetype_label: Optional[str] = None
    behavioral_summary: Optional[str] = None
    scenario_predictions: Optional[Any] = None
    bias_fingerprint: Optional[Any] = None
    wizard_completed: bool
    wizard_skipped: bool

    model_config = {"from_attributes": True}
