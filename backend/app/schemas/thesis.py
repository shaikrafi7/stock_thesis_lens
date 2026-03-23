from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, field_validator

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


class ThesisCreate(BaseModel):
    category: ThesisCategory
    statement: str

    @field_validator("statement")
    @classmethod
    def validate_statement(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 10:
            raise ValueError("Statement must be at least 10 characters.")
        return v


class ThesisGenerateRequest(BaseModel):
    ticker: str
