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
    closed_at: Optional[datetime] = None
    outcome: Optional[str] = None  # played_out | partial | failed | invalidated
    lessons: Optional[str] = None

    model_config = {"from_attributes": True}


ThesisOutcome = Literal["played_out", "partial", "failed", "invalidated"]


class ThesisCloseRequest(BaseModel):
    """Close a thesis with a post-mortem record."""
    outcome: ThesisOutcome
    lessons: str

    @field_validator("lessons")
    @classmethod
    def validate_lessons(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 10:
            raise ValueError("Lessons must be at least 10 characters.")
        return v


class ClosedThesisEntry(BaseModel):
    """One row of the cross-stock post-mortem journal."""
    thesis_id: int
    ticker: str
    stock_name: Optional[str] = None
    category: str
    statement: str
    outcome: str
    lessons: Optional[str] = None
    closed_at: datetime
    created_at: datetime
    duration_days: int
    importance: str = "standard"
    frozen: bool = False
    conviction: Optional[str] = None

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
    related_thesis: Optional[str] = None  # existing thesis statement this news challenges/supports


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


class ConfirmPreviewRequest(BaseModel):
    """Approved thesis points from the preview modal — save exactly these."""
    points: list[ThesisPreview]


class BacktestPoint(BaseModel):
    date: str  # ISO date of evaluation
    score: float
    status: str
    price_at_eval: Optional[float]
    return_30d: Optional[float]
    return_90d: Optional[float]
    return_180d: Optional[float]


class ThesisAuditRead(BaseModel):
    id: int
    thesis_id: Optional[int]
    action: str
    field_changed: Optional[str]
    old_value: Optional[str]
    new_value: Optional[str]
    statement_snapshot: str
    category: str
    note: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}
