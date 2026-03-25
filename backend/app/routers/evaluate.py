"""Evaluate router — runs the full thesis evaluation pipeline for a stock."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.stock import Stock
from app.models.thesis import Thesis
from app.models.evaluation import Evaluation
from app.schemas.evaluation import EvaluationRead, EvaluationSummary
from app.services.evaluation_service import run_evaluation_for_stock

router = APIRouter(prefix="/stocks", tags=["evaluate"])


@router.post("/{ticker}/evaluate", response_model=EvaluationRead)
def run_evaluation(ticker: str, db: Session = Depends(get_db)):
    ticker = ticker.upper()
    stock = db.query(Stock).filter(Stock.ticker == ticker).first()
    if not stock:
        raise HTTPException(status_code=404, detail=f"Stock '{ticker}' not found")

    selected_count = (
        db.query(Thesis)
        .filter(Thesis.stock_id == stock.id, Thesis.selected == True)  # noqa: E712
        .count()
    )
    if selected_count < 3:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Select at least 3 thesis points for {ticker} before evaluating "
                f"({selected_count} currently selected)."
            ),
        )

    evaluation = run_evaluation_for_stock(stock, db)
    if evaluation is None:
        raise HTTPException(status_code=500, detail=f"Evaluation failed for {ticker}")

    return evaluation


@router.get("/{ticker}/evaluation", response_model=EvaluationRead)
def get_latest_evaluation(ticker: str, db: Session = Depends(get_db)):
    ticker = ticker.upper()
    stock = db.query(Stock).filter(Stock.ticker == ticker).first()
    if not stock:
        raise HTTPException(status_code=404, detail=f"Stock '{ticker}' not found")

    evaluation = (
        db.query(Evaluation)
        .filter(Evaluation.stock_id == stock.id)
        .order_by(Evaluation.timestamp.desc())
        .first()
    )
    if not evaluation:
        raise HTTPException(status_code=404, detail=f"No evaluation found for {ticker}. Run POST /{ticker}/evaluate first.")

    return evaluation


@router.get("/{ticker}/evaluation-history", response_model=list[EvaluationSummary])
def get_evaluation_history(
    ticker: str,
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Return all evaluations for a stock, oldest first (for charting)."""
    ticker = ticker.upper()
    stock = db.query(Stock).filter(Stock.ticker == ticker).first()
    if not stock:
        raise HTTPException(status_code=404, detail=f"Stock '{ticker}' not found")

    evaluations = (
        db.query(Evaluation)
        .filter(Evaluation.stock_id == stock.id)
        .order_by(Evaluation.timestamp.asc())
        .limit(limit)
        .all()
    )
    return evaluations
