from pydantic import BaseModel
from datetime import datetime


class PortfolioCreate(BaseModel):
    name: str
    description: str | None = None


class PortfolioUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class PortfolioRead(BaseModel):
    id: int
    name: str
    description: str | None
    is_default: bool
    created_at: datetime
    stock_count: int = 0

    model_config = {"from_attributes": True}
