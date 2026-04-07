"""Evaluate router — runs the full thesis evaluation pipeline for a stock."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.stock import Stock
from app.models.thesis import Thesis
from app.models.evaluation import Evaluation
from app.models.user import User
from app.schemas.evaluation import EvaluationRead, EvaluationSummary
from app.services.evaluation_service import run_evaluation_for_stock
from app.core.auth import get_current_user
from app.routers.stocks import get_user_stock

router = APIRouter(prefix="/stocks", tags=["evaluate"])


def _get_investor_profile(user: User) -> dict | None:
    p = getattr(user, "investor_profile", None)
    if p and p.wizard_completed:
        return {"investment_style": p.investment_style, "time_horizon": p.time_horizon, "loss_aversion": p.loss_aversion, "risk_capacity": p.risk_capacity, "experience_level": p.experience_level}
    return None


@router.post("/{ticker}/evaluate", response_model=EvaluationRead)
def run_evaluation(ticker: str, portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    stock = get_user_stock(ticker, current_user, db, portfolio_id)

    selected_count = (
        db.query(Thesis)
        .filter(Thesis.stock_id == stock.id, Thesis.selected == True)  # noqa: E712
        .count()
    )
    if selected_count < 3:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Select at least 3 thesis points for {stock.ticker} before evaluating "
                f"({selected_count} currently selected)."
            ),
        )

    evaluation = run_evaluation_for_stock(stock, db, investor_profile=_get_investor_profile(current_user))
    if evaluation is None:
        raise HTTPException(status_code=500, detail=f"Evaluation failed for {stock.ticker}")

    return evaluation


@router.get("/{ticker}/evaluation", response_model=EvaluationRead)
def get_latest_evaluation(ticker: str, portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    stock = get_user_stock(ticker, current_user, db, portfolio_id)

    evaluation = (
        db.query(Evaluation)
        .filter(Evaluation.stock_id == stock.id)
        .order_by(Evaluation.timestamp.desc())
        .first()
    )
    if not evaluation:
        raise HTTPException(status_code=404, detail=f"No evaluation found for {stock.ticker}. Run POST /{stock.ticker}/evaluate first.")

    return evaluation


@router.get("/{ticker}/evaluation-history", response_model=list[EvaluationSummary])
def get_evaluation_history(
    ticker: str,
    limit: int = Query(default=20, ge=1, le=100),
    portfolio_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stock = get_user_stock(ticker, current_user, db, portfolio_id)

    evaluations = (
        db.query(Evaluation)
        .filter(Evaluation.stock_id == stock.id)
        .order_by(Evaluation.timestamp.asc())
        .limit(limit)
        .all()
    )
    return evaluations
