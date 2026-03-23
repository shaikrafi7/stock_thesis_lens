"""Evaluate router — runs the full thesis evaluation pipeline for a stock."""
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.stock import Stock
from app.models.thesis import Thesis
from app.models.evaluation import Evaluation
from app.schemas.evaluation import EvaluationRead
from app.agents.signal_collector import collect_signals
from app.agents.signal_interpreter import interpret_signals
from app.agents.thesis_evaluator import evaluate_thesis
from app.agents.explanation_agent import generate_explanation

router = APIRouter(prefix="/stocks", tags=["evaluate"])


@router.post("/{ticker}/evaluate", response_model=EvaluationRead)
def run_evaluation(ticker: str, db: Session = Depends(get_db)):
    ticker = ticker.upper()
    stock = db.query(Stock).filter(Stock.ticker == ticker).first()
    if not stock:
        raise HTTPException(status_code=404, detail=f"Stock '{ticker}' not found")

    selected_theses = (
        db.query(Thesis)
        .filter(Thesis.stock_id == stock.id, Thesis.selected == True)  # noqa: E712
        .all()
    )
    if len(selected_theses) < 3:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Select at least 3 thesis points for {ticker} before evaluating "
                f"({len(selected_theses)} currently selected)."
            ),
        )

    thesis_dicts = [
        {"id": t.id, "category": t.category, "statement": t.statement, "weight": t.weight}
        for t in selected_theses
    ]

    # Pipeline
    signals = collect_signals(ticker, stock.name)
    mappings = interpret_signals(signals, thesis_dicts)
    result = evaluate_thesis(mappings)
    explanation = generate_explanation(ticker, result)

    # Save evaluation
    evaluation = Evaluation(
        stock_id=stock.id,
        score=result.score,
        status=result.status,
        explanation=explanation,
        broken_points=json.dumps(result.broken_points),
        confirmed_points=json.dumps(result.confirmed_points),
    )
    db.add(evaluation)
    db.commit()
    db.refresh(evaluation)

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
