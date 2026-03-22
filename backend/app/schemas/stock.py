from pydantic import BaseModel, field_validator
from app.schemas.thesis import ThesisRead


class StockCreate(BaseModel):
    ticker: str
    name: str = ""  # optional — auto-looked up from Polygon if blank

    @field_validator("ticker")
    @classmethod
    def uppercase_ticker(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        return v.strip()


class StockRead(BaseModel):
    id: int
    ticker: str
    name: str

    model_config = {"from_attributes": True}


class StockWithTheses(StockRead):
    theses: list[ThesisRead] = []
