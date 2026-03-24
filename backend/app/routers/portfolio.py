import logging
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, subqueryload

from app.database import get_db
from app.models.stock import Stock
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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/portfolio", tags=["portfolio"])

# Simple in-memory daily cache: {date_string -> MorningBriefingResponse}
_briefing_cache: dict[str, MorningBriefingResponse] = {}


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


@router.get("/morning-briefing", response_model=MorningBriefingResponse)
async def morning_briefing(db: Session = Depends(get_db)):
    today = str(date.today())

    if today in _briefing_cache:
        return _briefing_cache[today]

    portfolio_data = _build_portfolio_data(db)
    tickers = [s["ticker"] for s in portfolio_data]
    ticker_names = {s["ticker"]: s["name"] for s in portfolio_data}

    news_items = await fetch_news(tickers, ticker_names=ticker_names, limit_per_ticker=5)
    briefing = morning_briefing_agent.generate_briefing(portfolio_data, news_items)

    items = []
    for item in briefing.items:
        suggestion = None
        if item.suggestion:
            suggestion = ThesisSuggestionSchema(
                category=item.suggestion["category"],
                statement=item.suggestion["statement"],
            )
        items.append(
            BriefingItemSchema(
                ticker=item.ticker,
                headline=item.headline,
                impact=item.impact,
                suggestion=suggestion,
            )
        )

    response = MorningBriefingResponse(summary=briefing.summary, items=items)
    _briefing_cache[today] = response
    return response
