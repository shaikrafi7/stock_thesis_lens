import json
import logging
from datetime import date

from pydantic import BaseModel
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, subqueryload

from app.database import get_db
from app.models.stock import Stock
from app.models.briefing import Briefing
from app.models.evaluation import Evaluation
from app.models.user import User
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
from app.core.auth import get_current_user
from app.routers.portfolios import get_active_portfolio

from app.agents import portfolio_chat_agent, morning_briefing_agent
from app.utils.news import fetch_news, _fetch_polygon_news
from app.utils.market_snapshot import get_snapshot
from app.services.evaluation_service import evaluate_all_stocks

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


def _get_investor_profile(user: User) -> dict | None:
    p = getattr(user, "investor_profile", None)
    if p is None or not p.wizard_completed:
        return None
    return {
        "investment_style": p.investment_style,
        "time_horizon": p.time_horizon,
        "loss_aversion": p.loss_aversion,
        "risk_capacity": p.risk_capacity,
        "experience_level": p.experience_level,
        "overconfidence_bias": p.overconfidence_bias,
        "primary_bias": p.primary_bias,
        "archetype_label": p.archetype_label,
    }


def _build_portfolio_data(db: Session, user: User, portfolio_id: int | None = None) -> list[dict]:
    portfolio = get_active_portfolio(portfolio_id, user, db)
    stocks = (
        db.query(Stock)
        .filter(Stock.portfolio_id == portfolio.id)
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


def _portfolio_context_key(portfolio_id: int) -> str:
    return f"__portfolio__{portfolio_id}"


@router.post("/chat", response_model=PortfolioChatResponse)
def portfolio_chat(payload: ChatRequest, portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    portfolio = get_active_portfolio(portfolio_id, current_user, db)
    portfolio_data = _build_portfolio_data(db, current_user, portfolio.id)

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
def portfolio_chat_stream(payload: ChatRequest, portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    portfolio = get_active_portfolio(portfolio_id, current_user, db)
    context_key = _portfolio_context_key(portfolio.id)
    portfolio_data = _build_portfolio_data(db, current_user, portfolio.id)

    for entry in portfolio_data:
        try:
            snap = get_snapshot(entry["ticker"])
            entry["price"] = snap.price
            entry["change_pct"] = snap.change_pct
        except Exception:
            pass

    messages = [{"role": m.role, "content": m.content} for m in payload.messages]
    user_id = current_user.id

    all_events = list(portfolio_chat_agent.chat_stream(portfolio_data, messages, investor_profile=_get_investor_profile(current_user)))
    accumulated = "".join(
        e["data"].get("content", "") or e["data"].get("text", "")
        for e in all_events if e["event"] == "token"
    )

    def event_generator():
        for event in all_events:
            yield f"event: {event['event']}\ndata: {json.dumps(event['data'])}\n\n"

    try:
        user_content = messages[-1]["content"] if messages else ""
        if user_content:
            db.add(ChatMessageModel(context_key=context_key, role="user", content=user_content, user_id=user_id))
        if accumulated:
            db.add(ChatMessageModel(context_key=context_key, role="assistant", content=accumulated, user_id=user_id))
        db.commit()
    except Exception as exc:
        logger.warning("Failed to persist portfolio chat: %s", exc)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/chat/history", response_model=list[ChatHistoryMessage])
def get_portfolio_chat_history(portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    portfolio = get_active_portfolio(portfolio_id, current_user, db)
    context_key = _portfolio_context_key(portfolio.id)
    messages = (
        db.query(ChatMessageModel)
        .filter(ChatMessageModel.context_key == context_key, ChatMessageModel.user_id == current_user.id)
        .order_by(ChatMessageModel.created_at.asc())
        .limit(40)
        .all()
    )
    return [ChatHistoryMessage(role=m.role, content=m.content) for m in messages]


@router.delete("/chat/history", status_code=204)
def clear_portfolio_chat_history(portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    portfolio = get_active_portfolio(portfolio_id, current_user, db)
    context_key = _portfolio_context_key(portfolio.id)
    db.query(ChatMessageModel).filter(
        ChatMessageModel.context_key == context_key, ChatMessageModel.user_id == current_user.id
    ).delete()
    db.commit()
    return None


@router.post("/evaluate-all")
def evaluate_all(portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    portfolio = get_active_portfolio(portfolio_id, current_user, db)
    summary = evaluate_all_stocks(db, user_id=current_user.id, portfolio_id=portfolio.id, investor_profile=_get_investor_profile(current_user))
    return summary


@router.get("/score-histories")
def portfolio_score_histories(
    limit: int = Query(default=10, ge=1, le=30),
    portfolio_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    portfolio = get_active_portfolio(portfolio_id, current_user, db)
    stocks = db.query(Stock).filter(Stock.portfolio_id == portfolio.id).order_by(Stock.ticker).all()
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
                    "timestamp": e.timestamp.isoformat() + "Z",
                }
                for e in evals
            ]
    return result


def _briefing_items_to_schema(items_data: list[dict]) -> list[BriefingItemSchema]:
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
                related_thesis=item.get("related_thesis") or None,
            )
        )
    result.sort(key=lambda x: (0 if x.ticker == "MACRO" else 1))
    return result


async def _generate_and_store_briefing(db: Session, user: User, portfolio_id: int) -> MorningBriefingResponse:
    today = date.today()

    portfolio_data = _build_portfolio_data(db, user, portfolio_id)
    tickers = [s["ticker"] for s in portfolio_data]
    ticker_names = {s["ticker"]: s["name"] for s in portfolio_data}

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

    import asyncio
    loop = asyncio.get_running_loop()
    try:
        macro_news = await loop.run_in_executor(
            None, _fetch_polygon_news, "MACRO", 3, 2
        )
    except Exception:
        macro_news = []

    briefing = morning_briefing_agent.generate_briefing(portfolio_data, news_items, macro_news=macro_news, investor_profile=_get_investor_profile(user))

    items_for_db = []
    for item in briefing.items:
        entry = {
            "ticker": item.ticker,
            "headline": item.headline,
            "impact": item.impact,
            "suggestion": item.suggestion,
            "source_url": item.source_url,
            "related_thesis": item.related_thesis,
        }
        items_for_db.append(entry)

    existing = db.query(Briefing).filter(
        Briefing.date == today, Briefing.portfolio_id == portfolio_id
    ).first()
    if existing:
        existing.summary = briefing.summary
        existing.items = json.dumps(items_for_db)
    else:
        db_briefing = Briefing(
            date=today,
            summary=briefing.summary,
            items=json.dumps(items_for_db),
            user_id=user.id,
            portfolio_id=portfolio_id,
        )
        db.add(db_briefing)
    db.commit()

    return MorningBriefingResponse(
        summary=briefing.summary,
        items=_briefing_items_to_schema(items_for_db),
        date=str(today),
    )


@router.get("/morning-briefing", response_model=MorningBriefingResponse)
async def morning_briefing(portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    portfolio = get_active_portfolio(portfolio_id, current_user, db)
    today = date.today()

    existing = db.query(Briefing).filter(
        Briefing.date == today, Briefing.portfolio_id == portfolio.id
    ).first()
    if existing:
        items_data = json.loads(existing.items) if existing.items else []
        return MorningBriefingResponse(
            summary=existing.summary,
            items=_briefing_items_to_schema(items_data),
            date=str(existing.date),
        )

    return await _generate_and_store_briefing(db, current_user, portfolio.id)


@router.post("/morning-briefing/refresh", response_model=MorningBriefingResponse)
async def refresh_morning_briefing(portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    portfolio = get_active_portfolio(portfolio_id, current_user, db)
    return await _generate_and_store_briefing(db, current_user, portfolio.id)


@router.get("/briefing-history", response_model=list[MorningBriefingResponse])
def briefing_history(
    limit: int = Query(default=7, ge=1, le=30),
    portfolio_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    portfolio = get_active_portfolio(portfolio_id, current_user, db)
    briefings = (
        db.query(Briefing)
        .filter(Briefing.portfolio_id == portfolio.id)
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
    portfolio_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import yfinance as yf

    VALID_PERIODS = {"1mo", "3mo", "6mo", "1y"}
    if period not in VALID_PERIODS:
        period = "3mo"

    portfolio = get_active_portfolio(portfolio_id, current_user, db)
    stocks = db.query(Stock).filter(Stock.portfolio_id == portfolio.id).order_by(Stock.ticker).all()
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
            closes = hist["Close"].dropna()
            if len(closes) >= 2:
                first_close = closes.iloc[0]
                last_close = closes.iloc[-1]
                ret = (last_close - first_close) / first_close * 100
                stock_returns.append({"ticker": stock.ticker, "return_pct": round(float(ret), 2)})
        except Exception:
            pass

    portfolio_return = 0.0
    if stock_returns:
        portfolio_return = round(sum(s["return_pct"] for s in stock_returns) / len(stock_returns), 2)

    benchmark_return = 0.0
    try:
        spy_closes = yf.Ticker("SPY").history(period=period)["Close"].dropna()
        if len(spy_closes) >= 2:
            benchmark_return = round(
                float((spy_closes.iloc[-1] - spy_closes.iloc[0]) / spy_closes.iloc[0] * 100), 2
            )
    except Exception:
        pass

    alpha = round(portfolio_return - benchmark_return, 2)
    stock_returns.sort(key=lambda s: s["return_pct"], reverse=True)

    return {
        "portfolio_return": portfolio_return,
        "benchmark_return": benchmark_return,
        "alpha": alpha,
        "period": period,
        "stocks": stock_returns,
    }


@router.get("/sparklines")
def portfolio_sparklines(portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    import yfinance as yf

    TARGET_POINTS = 30
    portfolio = get_active_portfolio(portfolio_id, current_user, db)
    stocks = db.query(Stock).filter(Stock.portfolio_id == portfolio.id).order_by(Stock.ticker).all()
    result: dict[str, list[float]] = {}
    for stock in stocks:
        try:
            hist = yf.Ticker(stock.ticker).history(period="1y")
            if len(hist) >= 2:
                closes = [v for v in hist["Close"].tolist() if v == v]  # filter NaN
                if len(closes) > TARGET_POINTS:
                    step = len(closes) / TARGET_POINTS
                    sampled = [closes[int(i * step)] for i in range(TARGET_POINTS - 1)]
                    sampled.append(closes[-1])
                else:
                    sampled = closes
                result[stock.ticker] = [round(float(v), 2) for v in sampled]
        except Exception:
            pass
    return result


@router.get("/sectors")
def portfolio_sectors(portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    import yfinance as yf

    portfolio = get_active_portfolio(portfolio_id, current_user, db)
    stocks = db.query(Stock).filter(Stock.portfolio_id == portfolio.id).order_by(Stock.ticker).all()
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
def portfolio_trends(portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    portfolio = get_active_portfolio(portfolio_id, current_user, db)
    stocks = db.query(Stock).filter(Stock.portfolio_id == portfolio.id).order_by(Stock.ticker).all()
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


class DigestStock(BaseModel):
    ticker: str
    name: str
    logo_url: str | None
    current_score: float | None
    previous_score: float | None
    trend: str

class WeeklyDigestResponse(BaseModel):
    generated_at: str
    portfolio_avg: float | None
    stocks: list[DigestStock]

@router.get("/digest", response_model=WeeklyDigestResponse)
def get_weekly_digest(portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from datetime import datetime, timedelta
    portfolio = get_active_portfolio(portfolio_id, current_user, db)
    stocks = db.query(Stock).filter(Stock.portfolio_id == portfolio.id).order_by(Stock.ticker).all()
    digest_stocks = []
    scores = []
    for stock in stocks:
        evals = db.query(Evaluation).filter(Evaluation.stock_id == stock.id).order_by(Evaluation.timestamp.desc()).limit(2).all()
        current = evals[0].score if evals else None
        previous = evals[1].score if len(evals) > 1 else None
        if current is not None:
            scores.append(current)
        trend = "new"
        if current is not None and previous is not None:
            trend = "up" if current > previous + 2 else "down" if current < previous - 2 else "flat"
        digest_stocks.append(DigestStock(
            ticker=stock.ticker,
            name=stock.name,
            logo_url=stock.logo_url,
            current_score=current,
            previous_score=previous,
            trend=trend,
        ))
    avg = sum(scores) / len(scores) if scores else None
    return WeeklyDigestResponse(
        generated_at=datetime.utcnow().isoformat(),
        portfolio_avg=avg,
        stocks=digest_stocks,
    )


class CalendarEvent(BaseModel):
    ticker: str
    name: str
    event_type: str  # "earnings" | "ex_dividend"
    date: str


@router.get("/calendar", response_model=list[CalendarEvent])
def portfolio_calendar(portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Return upcoming earnings + ex-dividend dates for all portfolio stocks (next 60 days)."""
    from datetime import datetime, timezone, timedelta
    import yfinance as yf

    portfolio = get_active_portfolio(portfolio_id, current_user, db)
    stocks = db.query(Stock).filter(Stock.portfolio_id == portfolio.id).all()
    now = datetime.now(tz=timezone.utc)
    cutoff = now + timedelta(days=60)
    events: list[CalendarEvent] = []

    for stock in stocks:
        try:
            t = yf.Ticker(stock.ticker)
            info = t.info or {}

            # Earnings date
            earnings_date_str = None
            try:
                cal = t.calendar
                if cal is not None and not cal.empty:
                    first_col = cal.columns[0]
                    ed = cal.loc["Earnings Date", first_col] if "Earnings Date" in cal.index else None
                    if ed is not None:
                        earnings_date_str = ed.strftime("%Y-%m-%d") if hasattr(ed, "strftime") else str(ed)[:10]
            except Exception:
                pass
            if earnings_date_str:
                ed_dt = datetime.strptime(earnings_date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                if now <= ed_dt <= cutoff:
                    events.append(CalendarEvent(ticker=stock.ticker, name=stock.name or stock.ticker, event_type="earnings", date=earnings_date_str))

            # Ex-dividend date
            ex_div_raw = info.get("exDividendDate")
            if ex_div_raw:
                try:
                    ex_div_dt = datetime.fromtimestamp(ex_div_raw, tz=timezone.utc)
                    if now <= ex_div_dt <= cutoff:
                        events.append(CalendarEvent(ticker=stock.ticker, name=stock.name or stock.ticker, event_type="ex_dividend", date=ex_div_dt.strftime("%Y-%m-%d")))
                except Exception:
                    pass
        except Exception:
            continue

    events.sort(key=lambda e: e.date)
    return events


class StreakResponse(BaseModel):
    current_streak: int
    longest_streak: int
    last_activity_date: str | None


@router.get("/streak", response_model=StreakResponse)
def portfolio_streak(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Return the user's current and longest consecutive review-day streak.

    A streak day is any UTC calendar day where the user ran at least one evaluation.
    """
    from datetime import datetime, timezone, timedelta
    from app.models.thesis_audit import ThesisAudit

    # Collect all active days from evaluations
    stocks = db.query(Stock).filter(Stock.user_id == current_user.id).all()
    stock_ids = [s.id for s in stocks]
    if not stock_ids:
        return StreakResponse(current_streak=0, longest_streak=0, last_activity_date=None)

    eval_dates = db.query(Evaluation.evaluated_at).filter(Evaluation.stock_id.in_(stock_ids)).all()
    audit_dates = db.query(ThesisAudit.created_at).filter(ThesisAudit.user_id == current_user.id).all()

    active_days: set[str] = set()
    for (dt,) in eval_dates:
        if dt:
            if hasattr(dt, "tzinfo") and dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            active_days.add(dt.strftime("%Y-%m-%d"))
    for (dt,) in audit_dates:
        if dt:
            if hasattr(dt, "tzinfo") and dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            active_days.add(dt.strftime("%Y-%m-%d"))

    if not active_days:
        return StreakResponse(current_streak=0, longest_streak=0, last_activity_date=None)

    sorted_days = sorted(active_days)
    today = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")
    yesterday = (datetime.now(tz=timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")

    # Compute longest streak
    longest = 1
    current_run = 1
    from datetime import date as date_type
    for i in range(1, len(sorted_days)):
        a = date_type.fromisoformat(sorted_days[i - 1])
        b = date_type.fromisoformat(sorted_days[i])
        if (b - a).days == 1:
            current_run += 1
            longest = max(longest, current_run)
        else:
            current_run = 1

    # Compute current streak (must include today or yesterday)
    if sorted_days[-1] not in (today, yesterday):
        current_streak = 0
    else:
        current_streak = 1
        for i in range(len(sorted_days) - 2, -1, -1):
            a = date_type.fromisoformat(sorted_days[i])
            b = date_type.fromisoformat(sorted_days[i + 1])
            if (b - a).days == 1:
                current_streak += 1
            else:
                break

    return StreakResponse(
        current_streak=current_streak,
        longest_streak=longest,
        last_activity_date=sorted_days[-1],
    )


class QuizQuestion(BaseModel):
    thesis_id: int
    statement: str
    category: str
    correct_ticker: str
    choices: list[str]  # 4 tickers including correct


@router.get("/quiz", response_model=QuizQuestion)
def portfolio_quiz(portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Return a random thesis statement and ask which stock it belongs to."""
    import random
    from app.models.thesis import Thesis

    portfolio = get_active_portfolio(portfolio_id, current_user, db)
    stocks = db.query(Stock).filter(Stock.portfolio_id == portfolio.id).all()
    if len(stocks) < 2:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="Need at least 2 stocks for a quiz")

    # Pick a random thesis from a random stock
    stock = random.choice(stocks)
    theses = db.query(Thesis).filter(Thesis.stock_id == stock.id, Thesis.selected == True).all()  # noqa: E712
    if not theses:
        # Fallback: try another stock
        for s in random.sample(stocks, len(stocks)):
            theses = db.query(Thesis).filter(Thesis.stock_id == s.id, Thesis.selected == True).all()  # noqa: E712
            if theses:
                stock = s
                break
    if not theses:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="No thesis points found")

    thesis = random.choice(theses)

    # Build 4 choices: correct + 3 random others
    other_tickers = [s.ticker for s in stocks if s.ticker != stock.ticker]
    wrong = random.sample(other_tickers, min(3, len(other_tickers)))
    choices = wrong + [stock.ticker]
    random.shuffle(choices)

    return QuizQuestion(
        thesis_id=thesis.id,
        statement=thesis.statement,
        category=thesis.category,
        correct_ticker=stock.ticker,
        choices=choices,
    )
