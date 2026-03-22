from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel

ThesisCategory = Literal["core_beliefs", "strengths", "risks", "leadership", "catalysts"]


class ThesisRead(BaseModel):
    id: int
    stock_id: int
    category: str
    statement: str
    selected: bool
    weight: float
    created_at: datetime
    last_confirmed: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ThesisUpdate(BaseModel):
    selected: bool


class ThesisGenerateRequest(BaseModel):
    ticker: str
