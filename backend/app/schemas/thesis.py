from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, field_validator, model_validator
from app.schemas.evaluation import EvaluationRead

ThesisCategory = Literal[
    "competitive_moat", "growth_trajectory", "valuation",
    "financial_health", "ownership_conviction", "risks",
]


class ThesisRead(BaseModel):
    id: int
    stock_id: int
    category: str
    statement: str
    selected: bool
    weight: float
    importance: str = "standard"  # standard | important | critical
    frozen: bool = False
    conviction: Optional[str] = None  # liked | disliked | null
    source: str = "ai"  # ai | manual
    sort_order: int = 0
    created_at: datetime
    last_confirmed: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ThesisUpdate(BaseModel):
    selected: Optional[bool] = None
    statement: Optional[str] = None
    frozen: Optional[bool] = None
    importance: Optional[Literal["standard", "important", "critical"]] = None
    conviction: Optional[Literal["liked", "disliked"]] = None
    clear_conviction: bool = False  # set True to clear conviction back to null

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


class PortfolioAction(BaseModel):
    type: Literal["add_stock", "delete_stock", "add_thesis"]
    ticker: str
    category: Optional[str] = None
    statement: Optional[str] = None


class PortfolioChatResponse(BaseModel):
    message: str
    action: Optional[PortfolioAction] = None


class BriefingItemSchema(BaseModel):
    ticker: str
    headline: str
    impact: str  # "bullish" | "bearish" | "neutral"
    suggestion: Optional[ThesisSuggestionSchema] = None
    source_url: Optional[str] = None


class MorningBriefingResponse(BaseModel):
    summary: str
    items: list[BriefingItemSchema]
    date: Optional[str] = None  # ISO date string, e.g. "2026-03-23"


class NewsItemSchema(BaseModel):
    title: str
    url: str
    published_utc: str


class ChatHistoryMessage(BaseModel):
    role: str
    content: str

    model_config = {"from_attributes": True}


class GenerateAndEvaluateResponse(BaseModel):
    theses: list[ThesisRead]
    evaluation: Optional[EvaluationRead] = None


class ThesisPreview(BaseModel):
    """A generated thesis point not yet saved to DB."""
    category: str
    statement: str
    importance: str = "standard"
    weight: float = 1.0
