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
    ChatHistoryMessage,
    MorningBriefingResponse,
    PortfolioChatResponse,
    PortfolioAction,
    ThesisSuggestionSchema,
)
from app.models.chat import ChatMessage as ChatMessageModel

PORTFOLIO_CONTEXT_KEY = "__portfolio__"
from app.agents import portfolio_chat_agent, morning_briefing_agent
from app.utils.news import fetch_news, _search_one_ticker
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
        accumulated = ""
        for event in portfolio_chat_agent.chat_stream(portfolio_data, messages):
            if event["event"] == "token":
                accumulated += event["data"].get("text", "")
            yield f"event: {event['event']}\ndata: {json.dumps(event['data'])}\n\n"

        # Persist conversation
        try:
            user_content = messages[-1]["content"] if messages else ""
            if user_content:
                db.add(ChatMessageModel(context_key=PORTFOLIO_CONTEXT_KEY, role="user", content=user_content))
            if accumulated:
                db.add(ChatMessageModel(context_key=PORTFOLIO_CONTEXT_KEY, role="assistant", content=accumulated))
            db.commit()
        except Exception:
            logger.warning("Failed to persist portfolio chat")

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/chat/history", response_model=list[ChatHistoryMessage])
def get_portfolio_chat_history(db: Session = Depends(get_db)):
    messages = (
        db.query(ChatMessageModel)
        .filter(ChatMessageModel.context_key == PORTFOLIO_CONTEXT_KEY)
        .order_by(ChatMessageModel.created_at.asc())
        .limit(40)
        .all()
    )
    return [ChatHistoryMessage(role=m.role, content=m.content) for m in messages]


@router.delete("/chat/history", status_code=204)
def clear_portfolio_chat_history(db: Session = Depends(get_db)):
    db.query(ChatMessageModel).filter(ChatMessageModel.context_key == PORTFOLIO_CONTEXT_KEY).delete()
    db.commit()
    return None


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
    """Convert raw briefing item dicts to schema objects, macro items first."""
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
                source_url=item.get("source_url") or None,
            )
        )
    # Always sort macro items first (covers cached briefings too)
    result.sort(key=lambda x: (0 if x.ticker == "MACRO" else 1))
    return result


async def _generate_and_store_briefing(db: Session) -> MorningBriefingResponse:
    """Generate a fresh briefing, store it in DB, and return the response."""
    today = date.today()

    portfolio_data = _build_portfolio_data(db)
    tickers = [s["ticker"] for s in portfolio_data]
    ticker_names = {s["ticker"]: s["name"] for s in portfolio_data}

    # Augment portfolio data with sector/industry for briefing context
    import yfinance as yf
    for s in portfolio_data:
        try:
            info = yf.Ticker(s["ticker"]).info or {}
            s["sector"] = info.get("sector", "")
            s["industry"] = info.get("industry", "")
        except Exception:
            s["sector"] = ""
            s["industry"] = ""

    news_items = await fetch_news(tickers, ticker_names=ticker_names, limit_per_ticker=5)

    # Fetch macro/market headlines
    import asyncio
    loop = asyncio.get_running_loop()
    try:
        macro_news = await loop.run_in_executor(
            None, _search_one_ticker, "MACRO", "stock market economy Fed interest rates", 3, 2
        )
    except Exception:
        macro_news = []

    briefing = morning_briefing_agent.generate_briefing(portfolio_data, news_items, macro_news=macro_news)

    # Serialize items for DB storage
    items_for_db = []
    for item in briefing.items:
        entry = {
            "ticker": item.ticker,
            "headline": item.headline,
            "impact": item.impact,
            "suggestion": item.suggestion,  # already a dict or None
            "source_url": item.source_url,
        }
        items_for_db.append(entry)

    # Persist to DB (replace existing today's entry if any)
    existing = db.query(Briefing).filter(Briefing.date == today).first()
    if existing:
        existing.summary = briefing.summary
        existing.items = json.dumps(items_for_db)
    else:
        db_briefing = Briefing(
            date=today,
            summary=briefing.summary,
            items=json.dumps(items_for_db),
        )
        db.add(db_briefing)
    db.commit()

    return MorningBriefingResponse(
        summary=briefing.summary,
        items=_briefing_items_to_schema(items_for_db),
        date=str(today),
    )


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

    return await _generate_and_store_briefing(db)


@router.post("/morning-briefing/refresh", response_model=MorningBriefingResponse)
async def refresh_morning_briefing(db: Session = Depends(get_db)):
    """Force-regenerate today's briefing with fresh news data."""
    return await _generate_and_store_briefing(db)


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


@router.get("/returns")
def portfolio_returns(
    period: str = Query(default="3mo"),
    db: Session = Depends(get_db),
):
    """Calculate equal-weight portfolio returns vs SPY benchmark."""
    import yfinance as yf

    VALID_PERIODS = {"1mo", "3mo", "6mo", "1y"}
    if period not in VALID_PERIODS:
        period = "3mo"

    stocks = db.query(Stock).order_by(Stock.ticker).all()
    if not stocks:
        return {
            "portfolio_return": 0,
            "benchmark_return": 0,
            "alpha": 0,
            "period": period,
            "stocks": [],
        }

    stock_returns = []
    for stock in stocks:
        try:
            hist = yf.Ticker(stock.ticker).history(period=period)
            if len(hist) >= 2:
                first_close = hist["Close"].iloc[0]
                last_close = hist["Close"].iloc[-1]
                ret = (last_close - first_close) / first_close * 100
                stock_returns.append({"ticker": stock.ticker, "return_pct": round(float(ret), 2)})
        except Exception:
            pass

    portfolio_return = 0.0
    if stock_returns:
        portfolio_return = round(sum(s["return_pct"] for s in stock_returns) / len(stock_returns), 2)

    # SPY benchmark
    benchmark_return = 0.0
    try:
        spy_hist = yf.Ticker("SPY").history(period=period)
        if len(spy_hist) >= 2:
            benchmark_return = round(
                float((spy_hist["Close"].iloc[-1] - spy_hist["Close"].iloc[0]) / spy_hist["Close"].iloc[0] * 100), 2
            )
    except Exception:
        pass

    alpha = round(portfolio_return - benchmark_return, 2)

    # Sort stocks by return descending
    stock_returns.sort(key=lambda s: s["return_pct"], reverse=True)

    return {
        "portfolio_return": portfolio_return,
        "benchmark_return": benchmark_return,
        "alpha": alpha,
        "period": period,
        "stocks": stock_returns,
    }


@router.get("/sparklines")
def portfolio_sparklines(db: Session = Depends(get_db)):
    """Return sampled 1-year price series for each stock (for sparkline display)."""
    import yfinance as yf

    TARGET_POINTS = 30
    stocks = db.query(Stock).order_by(Stock.ticker).all()
    result: dict[str, list[float]] = {}
    for stock in stocks:
        try:
            hist = yf.Ticker(stock.ticker).history(period="1y")
            if len(hist) >= 2:
                closes = hist["Close"].tolist()
                # Sample down to ~TARGET_POINTS
                if len(closes) > TARGET_POINTS:
                    step = len(closes) / TARGET_POINTS
                    sampled = [closes[int(i * step)] for i in range(TARGET_POINTS - 1)]
                    sampled.append(closes[-1])  # always include latest
                else:
                    sampled = closes
                result[stock.ticker] = [round(float(v), 2) for v in sampled]
        except Exception:
            pass
    return result


@router.get("/sectors")
def portfolio_sectors(db: Session = Depends(get_db)):
    """Return sector for each stock in the portfolio."""
    import yfinance as yf

    stocks = db.query(Stock).order_by(Stock.ticker).all()
    result = []
    for stock in stocks:
        try:
            info = yf.Ticker(stock.ticker).info or {}
            sector = info.get("sector", "Unknown")
        except Exception:
            sector = "Unknown"
        result.append({"ticker": stock.ticker, "sector": sector})
    return result


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
