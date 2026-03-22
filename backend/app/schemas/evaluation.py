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


class EvaluationRead(BaseModel):
    id: int
    stock_id: int
    score: float
    status: str
    explanation: Optional[str] = None
    broken_points: list[BrokenPoint] = []
    timestamp: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def parse_broken_points(cls, data: Any) -> Any:
        # Handle ORM objects where broken_points is a JSON string
        if hasattr(data, "__dict__"):
            raw = getattr(data, "broken_points", None)
            if isinstance(raw, str):
                try:
                    parsed = json.loads(raw)
                except (json.JSONDecodeError, TypeError):
                    parsed = []
                obj_dict = {c.key: getattr(data, c.key) for c in data.__table__.columns}
                obj_dict["broken_points"] = parsed
                return obj_dict
        return data
