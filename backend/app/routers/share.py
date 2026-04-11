"""Public share endpoint — no auth required."""
import base64
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.stock import Stock
from app.models.thesis import Thesis
from app.models.evaluation import Evaluation

router = APIRouter(prefix="/share", tags=["share"])


def _encode(stock_id: int) -> str:
    return base64.urlsafe_b64encode(str(stock_id).encode()).decode().rstrip("=")


def _decode(token: str) -> int:
    padded = token + "=" * (-len(token) % 4)
    return int(base64.urlsafe_b64decode(padded).decode())


class PublicThesisPoint(BaseModel):
    category: str
    statement: str
    importance: str
    frozen: bool
    conviction: str | None


class PublicEvaluation(BaseModel):
    score: int
    status: str
    explanation: str | None
    confirmed_points: list[dict]
    broken_points: list[dict]


class PublicShareResponse(BaseModel):
    ticker: str
    name: str
    logo_url: str | None
    share_token: str
    theses: list[PublicThesisPoint]
    evaluation: PublicEvaluation | None


@router.get("/{token}", response_model=PublicShareResponse)
def get_shared_thesis(token: str, db: Session = Depends(get_db)):
    try:
        stock_id = _decode(token)
    except Exception:
        raise HTTPException(status_code=404, detail="Invalid share link")

    stock = db.query(Stock).filter(Stock.id == stock_id).first()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")

    theses = db.query(Thesis).filter(Thesis.stock_id == stock.id, Thesis.selected == True).all()  # noqa: E712

    evaluation = (
        db.query(Evaluation)
        .filter(Evaluation.stock_id == stock.id)
        .order_by(Evaluation.timestamp.desc())
        .first()
    )

    eval_out = None
    if evaluation:
        def _parse(raw):
            if isinstance(raw, str):
                try:
                    return json.loads(raw)
                except Exception:
                    return []
            return raw or []

        eval_out = PublicEvaluation(
            score=round(evaluation.score),
            status=evaluation.status,
            explanation=evaluation.explanation,
            confirmed_points=_parse(evaluation.confirmed_points),
            broken_points=_parse(evaluation.broken_points),
        )

    return PublicShareResponse(
        ticker=stock.ticker,
        name=stock.name,
        logo_url=stock.logo_url,
        share_token=_encode(stock.id),
        theses=[
            PublicThesisPoint(
                category=t.category,
                statement=t.statement,
                importance=t.importance or "standard",
                frozen=bool(t.frozen),
                conviction=t.conviction,
            )
            for t in theses
        ],
        evaluation=eval_out,
    )
