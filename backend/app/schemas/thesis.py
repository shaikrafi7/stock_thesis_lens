from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, field_validator, model_validator

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
    selected: Optional[bool] = None
    statement: Optional[str] = None

    @field_validator("statement")
    @classmethod
    def validate_statement(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if len(v) < 10:
                raise ValueError("Statement must be at least 10 characters.")
        return v


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


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]

    @model_validator(mode="after")
    def validate_messages(self) -> "ChatRequest":
        if not self.messages:
            raise ValueError("messages must not be empty")
        return self


class ThesisSuggestionSchema(BaseModel):
    category: str
    statement: str


class ChatResponse(BaseModel):
    message: str
    suggestion: Optional[ThesisSuggestionSchema] = None
