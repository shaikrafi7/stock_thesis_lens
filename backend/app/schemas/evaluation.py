import json
from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, model_validator


class BrokenPoint(BaseModel):
    thesis_id: int
    category: str
    statement: str
    signal: str
    sentiment: str
    deduction: float


class ConfirmedPoint(BaseModel):
    thesis_id: int
    category: str
    statement: str
    signal: str
    sentiment: str
    credit: float


class EvaluationRead(BaseModel):
    id: int
    stock_id: int
    score: float
    status: str
    explanation: Optional[str] = None
    broken_points: list[BrokenPoint] = []
    confirmed_points: list[ConfirmedPoint] = []
    frozen_breaks: list[BrokenPoint] = []
    timestamp: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def parse_json_fields(cls, data: Any) -> Any:
        # Handle ORM objects where broken_points/confirmed_points/frozen_breaks are JSON strings
        if hasattr(data, "__dict__"):
            obj_dict = {c.key: getattr(data, c.key) for c in data.__table__.columns}
            for field in ("broken_points", "confirmed_points", "frozen_breaks"):
                raw = obj_dict.get(field)
                if isinstance(raw, str):
                    try:
                        obj_dict[field] = json.loads(raw)
                    except (json.JSONDecodeError, TypeError):
                        obj_dict[field] = []
                elif raw is None:
                    obj_dict[field] = []
            return obj_dict
        return data


class EvaluationSummary(BaseModel):
    """Lightweight schema for history charts — no broken/confirmed details."""
    id: int
    score: float
    status: str
    timestamp: datetime

    model_config = {"from_attributes": True}


class StockTrend(BaseModel):
    ticker: str
    score: float
    previous_score: Optional[float] = None
    trend: str  # "up" | "down" | "flat" | "new"
