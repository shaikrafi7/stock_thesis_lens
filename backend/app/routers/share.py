"""Public share endpoint — no auth required."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.stock import Stock
from app.models.thesis import Thesis
from app.models.evaluation import Evaluation
from app.models.share_token import ShareToken

router = APIRouter(prefix="/share", tags=["share"])


def get_or_create_token(stock_id: int, db: Session) -> str:
    """Return existing share token for stock, or create a new UUID one."""
    existing = db.query(ShareToken).filter(ShareToken.stock_id == stock_id).first()
    if existing:
        return existing.token
    token = str(uuid.uuid4())
    db.add(ShareToken(token=token, stock_id=stock_id))
    db.commit()
    return token


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
    # Look up by UUID token
    share = db.query(ShareToken).filter(ShareToken.token == token).first()
    if not share:
        raise HTTPException(status_code=404, detail="Invalid share link")

    stock = db.query(Stock).filter(Stock.id == share.stock_id).first()
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
        eval_out = PublicEvaluation(
            score=round(evaluation.score),
            status=evaluation.status,
            explanation=evaluation.explanation,
            confirmed_points=evaluation.parsed_confirmed_points,
            broken_points=evaluation.parsed_broken_points,
        )

    return PublicShareResponse(
        ticker=stock.ticker,
        name=stock.name,
        logo_url=stock.logo_url,
        share_token=get_or_create_token(stock.id, db),
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
