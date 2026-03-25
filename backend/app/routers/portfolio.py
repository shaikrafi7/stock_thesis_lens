import json
import logging
from datetime import date

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, subqueryload

from app.database import get_db
from app.models.stock import Stock
from app.models.briefing import Briefing
from app.models.evaluation import Evaluation
from app.schemas.evaluation import EvaluationSummary, StockTrend
from app.schemas.thesis import (
    BriefingItemSchema,
    ChatRequest,
    MorningBriefingResponse,
    PortfolioChatResponse,
    PortfolioAction,
    ThesisSuggestionSchema,
)
from app.agents import portfolio_chat_agent, morning_briefing_agent
from app.utils.news import fetch_news
from app.utils.market_snapshot import get_snapshot
from app.services.evaluation_service import evaluate_all_stocks

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


def _build_portfolio_data(db: Session) -> list[dict]:
    """Return portfolio snapshot for all stocks. Uses eager loading to avoid N+1."""
    stocks = (
        db.query(Stock)
        .options(subqueryload(Stock.theses), subqueryload(Stock.evaluations))
        .order_by(Stock.ticker)
        .all()
    )
    result = []
    for stock in stocks:
        latest_eval = max(stock.evaluations, key=lambda e: e.id, default=None)
        result.append(
            {
                "ticker": stock.ticker,
                "name": stock.name,
                "theses": [
                    {"category": t.category, "statement": t.statement, "selected": t.selected}
                    for t in stock.theses
                ],
                "score": latest_eval.score if latest_eval else None,
                "status": latest_eval.status if latest_eval else None,
            }
        )
    return result


@router.post("/chat", response_model=PortfolioChatResponse)
def portfolio_chat(payload: ChatRequest, db: Session = Depends(get_db)):
    portfolio_data = _build_portfolio_data(db)

    # Inject live prices for each stock
    for entry in portfolio_data:
        try:
            snap = get_snapshot(entry["ticker"])
            entry["price"] = snap.price
            entry["change_pct"] = snap.change_pct
        except Exception:
            pass

    messages = [{"role": m.role, "content": m.content} for m in payload.messages]

    chat_result = portfolio_chat_agent.chat(portfolio_data, messages)

    action = None
    if chat_result.action:
        a = chat_result.action
        action = PortfolioAction(
            type=a.type,
            ticker=a.ticker,
            category=a.category,
            statement=a.statement,
        )

    return PortfolioChatResponse(message=chat_result.message, action=action)


@router.post("/chat/stream")
def portfolio_chat_stream(payload: ChatRequest, db: Session = Depends(get_db)):
    portfolio_data = _build_portfolio_data(db)

    for entry in portfolio_data:
        try:
            snap = get_snapshot(entry["ticker"])
            entry["price"] = snap.price
            entry["change_pct"] = snap.change_pct
        except Exception:
            pass

    messages = [{"role": m.role, "content": m.content} for m in payload.messages]

    def event_generator():
        for event in portfolio_chat_agent.chat_stream(portfolio_data, messages):
            yield f"event: {event['event']}\ndata: {json.dumps(event['data'])}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/evaluate-all")
def evaluate_all(db: Session = Depends(get_db)):
    """Trigger evaluation for all portfolio stocks that have >= 3 selected theses."""
    summary = evaluate_all_stocks(db)
    return summary


@router.get("/score-histories")
def portfolio_score_histories(
    limit: int = Query(default=10, ge=1, le=30),
    db: Session = Depends(get_db),
):
    """Return recent evaluation scores for every stock, for sparkline display."""
    stocks = db.query(Stock).order_by(Stock.ticker).all()
    result: dict[str, list[dict]] = {}
    for stock in stocks:
        evals = (
            db.query(Evaluation)
            .filter(Evaluation.stock_id == stock.id)
            .order_by(Evaluation.timestamp.asc())
            .limit(limit)
            .all()
        )
        if evals:
            result[stock.ticker] = [
                {
                    "id": e.id,
                    "score": e.score,
                    "status": e.status,
                    "timestamp": str(e.timestamp),
                }
                for e in evals
            ]
    return result


def _briefing_items_to_schema(items_data: list[dict]) -> list[BriefingItemSchema]:
    """Convert raw briefing item dicts to schema objects."""
    result = []
    for item in items_data:
        suggestion = None
        s = item.get("suggestion")
        if isinstance(s, dict) and s.get("category") and s.get("statement"):
            suggestion = ThesisSuggestionSchema(
                category=s["category"],
                statement=s["statement"],
            )
        result.append(
            BriefingItemSchema(
                ticker=item.get("ticker", ""),
                headline=item.get("headline", ""),
                impact=item.get("impact", "neutral"),
                suggestion=suggestion,
            )
        )
    return result


@router.get("/morning-briefing", response_model=MorningBriefingResponse)
async def morning_briefing(db: Session = Depends(get_db)):
    today = date.today()

    # Check DB for today's cached briefing
    existing = db.query(Briefing).filter(Briefing.date == today).first()
    if existing:
        items_data = json.loads(existing.items) if existing.items else []
        return MorningBriefingResponse(
            summary=existing.summary,
            items=_briefing_items_to_schema(items_data),
            date=str(existing.date),
        )

    # Generate fresh briefing
    portfolio_data = _build_portfolio_data(db)
    tickers = [s["ticker"] for s in portfolio_data]
    ticker_names = {s["ticker"]: s["name"] for s in portfolio_data}

    news_items = await fetch_news(tickers, ticker_names=ticker_names, limit_per_ticker=5)
    briefing = morning_briefing_agent.generate_briefing(portfolio_data, news_items)

    # Serialize items for DB storage
    items_for_db = []
    for item in briefing.items:
        entry = {
            "ticker": item.ticker,
            "headline": item.headline,
            "impact": item.impact,
            "suggestion": item.suggestion,  # already a dict or None
        }
        items_for_db.append(entry)

    # Persist to DB
    db_briefing = Briefing(
        date=today,
        summary=briefing.summary,
        items=json.dumps(items_for_db),
    )
    db.add(db_briefing)
    db.commit()

    # Build response
    return MorningBriefingResponse(
        summary=briefing.summary,
        items=_briefing_items_to_schema(items_for_db),
        date=str(today),
    )


@router.get("/briefing-history", response_model=list[MorningBriefingResponse])
def briefing_history(
    limit: int = Query(default=7, ge=1, le=30),
    db: Session = Depends(get_db),
):
    """Return past briefings ordered by date descending."""
    briefings = (
        db.query(Briefing)
        .order_by(Briefing.date.desc())
        .limit(limit)
        .all()
    )
    results = []
    for b in briefings:
        items_data = json.loads(b.items) if b.items else []
        results.append(
            MorningBriefingResponse(
                summary=b.summary,
                items=_briefing_items_to_schema(items_data),
                date=str(b.date),
            )
        )
    return results


@router.get("/trends", response_model=list[StockTrend])
def portfolio_trends(db: Session = Depends(get_db)):
    """Return current + previous score for each stock to show trend arrows."""
    stocks = db.query(Stock).order_by(Stock.ticker).all()
    trends = []
    for stock in stocks:
        evals = (
            db.query(Evaluation)
            .filter(Evaluation.stock_id == stock.id)
            .order_by(Evaluation.timestamp.desc())
            .limit(2)
            .all()
        )
        if not evals:
            continue
        current = evals[0].score
        previous = evals[1].score if len(evals) > 1 else None
        if previous is None:
            trend = "new"
        elif current > previous + 2:
            trend = "up"
        elif current < previous - 2:
            trend = "down"
        else:
            trend = "flat"
        trends.append(StockTrend(
            ticker=stock.ticker,
            score=current,
            previous_score=previous,
            trend=trend,
        ))
    return trends
