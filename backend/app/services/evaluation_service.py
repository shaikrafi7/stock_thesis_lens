"""Shared evaluation logic used by both the single-stock endpoint and evaluate-all."""

import json
import logging

from sqlalchemy.orm import Session

from app.models.stock import Stock
from app.models.thesis import Thesis
from app.models.evaluation import Evaluation
from app.agents.signal_collector import collect_signals
from app.agents.signal_interpreter import interpret_signals
from app.agents.thesis_evaluator import evaluate_thesis
from app.agents.explanation_agent import generate_explanation
from app.agents.thesis_generator import generate_thesis

logger = logging.getLogger(__name__)

MIN_SELECTED = 3


def run_evaluation_for_stock(stock: Stock, db: Session, investor_profile: dict | None = None) -> Evaluation | None:
    """Run the full evaluation pipeline for a stock.

    Returns the saved Evaluation, or None if fewer than MIN_SELECTED theses.
    Never raises — logs errors and returns None on failure.
    """
    try:
        selected_theses = (
            db.query(Thesis)
            .filter(
                Thesis.stock_id == stock.id,
                Thesis.selected == True,  # noqa: E712
                Thesis.closed_at.is_(None),
            )
            .all()
        )
        if len(selected_theses) < MIN_SELECTED:
            return None

        thesis_dicts = [
            {"id": t.id, "category": t.category, "statement": t.statement, "weight": t.weight}
            for t in selected_theses
        ]

        # Build metadata lookup for importance multiplier + frozen break detection + conviction
        thesis_meta = {
            t.id: {
                "importance": getattr(t, "importance", "standard") or "standard",
                "frozen": bool(getattr(t, "frozen", False)),
                "conviction": getattr(t, "conviction", None),
            }
            for t in selected_theses
        }

        # Pipeline
        signals = collect_signals(stock.ticker, stock.name)
        mappings = interpret_signals(signals, thesis_dicts)
        result = evaluate_thesis(mappings, thesis_meta, investor_profile=investor_profile)
        explanation = generate_explanation(stock.ticker, result)

        # Update last_confirmed on confirmed thesis points
        from datetime import datetime
        confirmed_ids = {bp["thesis_id"] for bp in result.confirmed_points if "thesis_id" in bp}
        if confirmed_ids:
            db.query(Thesis).filter(Thesis.id.in_(confirmed_ids)).update(
                {Thesis.last_confirmed: datetime.utcnow()}, synchronize_session=False
            )

        # Save evaluation
        evaluation = Evaluation(
            stock_id=stock.id,
            score=result.score,
            status=result.status,
            explanation=explanation,
            broken_points=json.dumps(result.broken_points),
            confirmed_points=json.dumps(result.confirmed_points),
            frozen_breaks=json.dumps(result.frozen_breaks),
        )
        db.add(evaluation)
        db.commit()
        db.refresh(evaluation)
        return evaluation

    except Exception as exc:
        logger.error("evaluation_service: failed for %s: %s", stock.ticker, exc)
        db.rollback()
        return None


def evaluate_all_stocks(db: Session, user_id: int | None = None, portfolio_id: int | None = None, investor_profile: dict | None = None) -> dict:
    """Evaluate all eligible stocks. Returns summary dict."""
    query = db.query(Stock)
    if portfolio_id is not None:
        query = query.filter(Stock.portfolio_id == portfolio_id)
    elif user_id is not None:
        query = query.filter(Stock.user_id == user_id)
    stocks = query.order_by(Stock.ticker).all()

    evaluated = []
    skipped = []
    errors = {}

    for stock in stocks:
        try:
            # Auto-generate theses for stocks that don't have enough
            selected_count = (
                db.query(Thesis)
                .filter(
                    Thesis.stock_id == stock.id,
                    Thesis.selected == True,  # noqa: E712
                    Thesis.closed_at.is_(None),
                )
                .count()
            )
            if selected_count < MIN_SELECTED:
                existing_stmts = [t.statement for t in db.query(Thesis).filter(Thesis.stock_id == stock.id).all()]
                generated = generate_thesis(stock.ticker, stock.name, existing_statements=existing_stmts)
                new_theses = [
                    Thesis(
                        stock_id=stock.id,
                        category=item.category,
                        statement=item.statement,
                        weight=item.weight,
                        importance=item.importance,
                        selected=True,
                    )
                    for item in generated
                ]
                db.add_all(new_theses)
                db.commit()
                logger.info("evaluate_all: auto-generated %d theses for %s", len(new_theses), stock.ticker)

            result = run_evaluation_for_stock(stock, db, investor_profile=investor_profile)
            if result is None:
                skipped.append(stock.ticker)
            else:
                evaluated.append(stock.ticker)
                logger.info("evaluate_all: %s → score %.0f", stock.ticker, result.score)
        except Exception as exc:
            errors[stock.ticker] = str(exc)
            logger.error("evaluate_all: %s failed: %s", stock.ticker, exc)

    return {
        "evaluated": evaluated,
        "skipped": skipped,
        "errors": errors,
    }
