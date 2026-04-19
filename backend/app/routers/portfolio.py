import hashlib
import json
import logging
from datetime import date

from pydantic import BaseModel
from fastapi import APIRouter, BackgroundTasks, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func
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
from app.core.utils import get_investor_profile
from app.routers.portfolios import get_active_portfolio
from app.routers.stocks import _clean_name

from app.agents import portfolio_chat_agent, morning_briefing_agent
from app.utils.news import fetch_news, _fetch_polygon_news
from app.utils.market_snapshot import get_snapshot
from app.services.evaluation_service import evaluate_all_stocks

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/portfolio", tags=["portfolio"])



def _build_portfolio_data(db: Session, user: User, portfolio_id: int | None = None) -> list[dict]:
    from app.models.evaluation import Evaluation
    portfolio = get_active_portfolio(portfolio_id, user, db)
    stocks = (
        db.query(Stock)
        .filter(Stock.portfolio_id == portfolio.id)
        .options(subqueryload(Stock.theses))
        .order_by(Stock.ticker)
        .all()
    )
    stock_ids = [s.id for s in stocks]

    # Latest eval per stock via a single query
    latest_eval_ids = (
        db.query(func.max(Evaluation.id))
        .filter(Evaluation.stock_id.in_(stock_ids))
        .group_by(Evaluation.stock_id)
        .subquery()
    )
    latest_evals = {
        e.stock_id: e
        for e in db.query(Evaluation).filter(Evaluation.id.in_(latest_eval_ids)).all()
    }

    result = []
    for stock in stocks:
        latest_eval = latest_evals.get(stock.id)
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
def portfolio_chat_stream(payload: ChatRequest, background_tasks: BackgroundTasks, portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
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
    user_content = messages[-1]["content"] if messages else ""

    def _persist(assistant_text: str):
        from app.database import SessionLocal
        session = SessionLocal()
        try:
            if user_content:
                session.add(ChatMessageModel(context_key=context_key, role="user", content=user_content, user_id=user_id))
            if assistant_text:
                session.add(ChatMessageModel(context_key=context_key, role="assistant", content=assistant_text, user_id=user_id))
            session.commit()
        except Exception as exc:
            logger.warning("Failed to persist portfolio chat: %s", exc)
        finally:
            session.close()

    def event_generator():
        tokens = []
        for event in portfolio_chat_agent.chat_stream(portfolio_data, messages, investor_profile=get_investor_profile(current_user)):
            if event["event"] == "token":
                tokens.append(event["data"].get("content", "") or event["data"].get("text", ""))
            yield f"event: {event['event']}\ndata: {json.dumps(event['data'])}\n\n"
        background_tasks.add_task(_persist, "".join(tokens))

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
    summary = evaluate_all_stocks(db, user_id=current_user.id, portfolio_id=portfolio.id, investor_profile=get_investor_profile(current_user))
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


def _compute_thesis_state_hash(db: Session, portfolio_id: int) -> str:
    """Stable hash over the thesis state of every stock in the portfolio.

    Cache is valid while this hash is stable; any thesis add/edit/close/freeze/
    conviction flip changes the hash and forces regeneration.
    """
    from app.models.thesis import Thesis
    rows = (
        db.query(Thesis.stock_id, Thesis.id, Thesis.statement, Thesis.selected,
                 Thesis.frozen, Thesis.conviction, Thesis.closed_at)
        .join(Stock, Stock.id == Thesis.stock_id)
        .filter(Stock.portfolio_id == portfolio_id)
        .order_by(Thesis.stock_id, Thesis.id)
        .all()
    )
    payload = [
        (
            int(r[0] or 0), int(r[1] or 0), (r[2] or "").strip(),
            bool(r[3]), bool(r[4]), r[5] or "", str(r[6] or ""),
        )
        for r in rows
    ]
    blob = json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()


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

    briefing = morning_briefing_agent.generate_briefing(portfolio_data, news_items, macro_news=macro_news, investor_profile=get_investor_profile(user))

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

    state_hash = _compute_thesis_state_hash(db, portfolio_id)
    existing = db.query(Briefing).filter(
        Briefing.date == today, Briefing.portfolio_id == portfolio_id
    ).first()
    if existing:
        existing.summary = briefing.summary
        existing.items = json.dumps(items_for_db)
        existing.thesis_state_hash = state_hash
    else:
        db_briefing = Briefing(
            date=today,
            summary=briefing.summary,
            items=json.dumps(items_for_db),
            thesis_state_hash=state_hash,
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
        current_hash = _compute_thesis_state_hash(db, portfolio.id)
        if existing.thesis_state_hash and existing.thesis_state_hash == current_hash:
            logger.info("briefing_cache: HIT portfolio=%s date=%s", portfolio.id, today)
            items_data = json.loads(existing.items) if existing.items else []
            return MorningBriefingResponse(
                summary=existing.summary,
                items=_briefing_items_to_schema(items_data),
                date=str(existing.date),
            )
        logger.info("briefing_cache: MISS portfolio=%s date=%s (thesis state changed)", portfolio.id, today)

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

    eval_dates = db.query(Evaluation.timestamp).filter(Evaluation.stock_id.in_(stock_ids)).all()
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


THESIS_CATEGORIES = [
    "competitive_moat",
    "growth_trajectory",
    "valuation",
    "financial_health",
    "ownership_conviction",
    "risks",
]


CATEGORY_DISPLAY = {
    "competitive_moat": "Competitive Moat",
    "growth_trajectory": "Growth Trajectory",
    "valuation": "Valuation",
    "financial_health": "Financial Health",
    "ownership_conviction": "Ownership & Conviction",
    "risks": "Risks & Bear Case",
}


OUTCOME_DISPLAY = {
    "played_out": "Played out",
    "partial": "Partial",
    "failed": "Broke",
    "invalidated": "Invalidated",
}


class QuizRoundQuestion(BaseModel):
    id: str
    type: str  # thesis_to_stock | point_to_category | signal_impact | closed_outcome
    stem: str
    choices: list[str]
    correct_index: int
    reveal: str


class QuizRound(BaseModel):
    questions: list[QuizRoundQuestion]


@router.get("/quiz/round", response_model=QuizRound)
def portfolio_quiz_round(
    portfolio_id: int | None = Query(None),
    size: int = Query(10, ge=3, le=20),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return a mixed round of quiz questions without leaking tickers in stems or options."""
    import random
    from fastapi import HTTPException
    from app.models.thesis import Thesis

    portfolio = get_active_portfolio(portfolio_id, current_user, db)
    stocks = db.query(Stock).filter(Stock.portfolio_id == portfolio.id).all()
    if len(stocks) < 2:
        raise HTTPException(status_code=422, detail="Need at least 2 stocks with thesis points to play.")

    stock_by_id = {s.id: s for s in stocks}
    all_theses: list[Thesis] = (
        db.query(Thesis)
        .filter(Thesis.stock_id.in_(stock_by_id.keys()), Thesis.selected == True)  # noqa: E712
        .all()
    )
    if len(all_theses) < 3:
        raise HTTPException(status_code=422, detail="Need at least 3 thesis points across your stocks.")

    open_theses = [t for t in all_theses if t.closed_at is None]
    closed_theses = [t for t in all_theses if t.closed_at is not None and t.outcome]

    # Latest evaluation per stock — used for signal_impact questions
    latest_eval_by_stock: dict[int, Evaluation] = {}
    for ev in db.query(Evaluation).filter(Evaluation.stock_id.in_(stock_by_id.keys())).all():
        prev = latest_eval_by_stock.get(ev.stock_id)
        if prev is None or ev.timestamp > prev.timestamp:
            latest_eval_by_stock[ev.stock_id] = ev

    def build_thesis_to_stock(thesis: Thesis) -> QuizRoundQuestion | None:
        stock = stock_by_id.get(thesis.stock_id)
        if stock is None:
            return None
        others = [s for s in stocks if s.id != stock.id]
        if len(others) < 1:
            return None
        wrong_sample = random.sample(others, min(3, len(others)))
        correct_label = _anon_stock_label(stock)
        options = [_anon_stock_label(s) for s in wrong_sample] + [correct_label]
        random.shuffle(options)
        return QuizRoundQuestion(
            id=f"t2s-{thesis.id}",
            type="thesis_to_stock",
            stem=f"Which holding is this thesis point from?\n\n\u201c{thesis.statement}\u201d",
            choices=options,
            correct_index=options.index(correct_label),
            reveal=f"From {stock.ticker} ({stock.name}).",
        )

    def build_point_to_category(thesis: Thesis) -> QuizRoundQuestion:
        options = [CATEGORY_DISPLAY[c] for c in THESIS_CATEGORIES]
        correct = CATEGORY_DISPLAY.get(thesis.category, thesis.category)
        return QuizRoundQuestion(
            id=f"p2c-{thesis.id}",
            type="point_to_category",
            stem=f"What category is this thesis point?\n\n\u201c{thesis.statement}\u201d",
            choices=options,
            correct_index=options.index(correct) if correct in options else 0,
            reveal=f"Category: {correct}.",
        )

    def build_signal_impact() -> QuizRoundQuestion | None:
        candidates = []
        for sid, ev in latest_eval_by_stock.items():
            for cp in (ev.confirmed_points or []):
                candidates.append(("confirmed", sid, cp))
            for bp in (ev.broken_points or []):
                candidates.append(("flagged", sid, bp))
        if not candidates:
            return None
        kind, sid, pt = random.choice(candidates)
        stock = stock_by_id.get(sid)
        if stock is None:
            return None
        statement = pt.get("statement") if isinstance(pt, dict) else getattr(pt, "statement", None)
        signal = pt.get("signal") if isinstance(pt, dict) else getattr(pt, "signal", None)
        if not statement or not signal:
            return None
        options = ["Confirmed", "Flagged"]
        correct_index = 0 if kind == "confirmed" else 1
        return QuizRoundQuestion(
            id=f"si-{stock.id}-{random.randint(1000, 9999)}",
            type="signal_impact",
            stem=(
                "Given this signal, did it confirm or flag the thesis?\n\n"
                f"Thesis: \u201c{statement}\u201d\nSignal: {signal}"
            ),
            choices=options,
            correct_index=correct_index,
            reveal=f"{options[correct_index]} — on {stock.ticker}.",
        )

    def build_closed_outcome(thesis: Thesis) -> QuizRoundQuestion | None:
        if not thesis.outcome or thesis.outcome not in OUTCOME_DISPLAY:
            return None
        stock = stock_by_id.get(thesis.stock_id)
        if stock is None:
            return None
        options = list(OUTCOME_DISPLAY.values())
        correct = OUTCOME_DISPLAY[thesis.outcome]
        return QuizRoundQuestion(
            id=f"co-{thesis.id}",
            type="closed_outcome",
            stem=f"What outcome did you record when you closed this thesis?\n\n\u201c{thesis.statement}\u201d",
            choices=options,
            correct_index=options.index(correct),
            reveal=f"Outcome: {correct} (on {stock.ticker}).",
        )

    # Plan the mix
    questions: list[QuizRoundQuestion] = []
    used_thesis_ids: set[int] = set()

    # 1 signal_impact if available
    sig_q = build_signal_impact()
    if sig_q is not None:
        questions.append(sig_q)

    # 1 closed_outcome if user has closed theses
    if closed_theses:
        ct = random.choice(closed_theses)
        co_q = build_closed_outcome(ct)
        if co_q is not None:
            questions.append(co_q)
            used_thesis_ids.add(ct.id)

    # Fill remainder with t2s and p2c in ~60/40 split
    open_pool = [t for t in open_theses if t.id not in used_thesis_ids]
    random.shuffle(open_pool)
    types_cycle = ["thesis_to_stock"] * 6 + ["point_to_category"] * 4
    random.shuffle(types_cycle)

    while len(questions) < size and open_pool:
        t = open_pool.pop()
        qtype = types_cycle.pop() if types_cycle else random.choice(["thesis_to_stock", "point_to_category"])
        q = build_thesis_to_stock(t) if qtype == "thesis_to_stock" else build_point_to_category(t)
        if q is None and qtype == "thesis_to_stock":
            q = build_point_to_category(t)
        if q is not None:
            questions.append(q)
            used_thesis_ids.add(t.id)

    if len(questions) < 3:
        raise HTTPException(status_code=422, detail="Not enough thesis content yet. Add more thesis points first.")

    random.shuffle(questions)
    return QuizRound(questions=questions[:size])


def _anon_stock_label(stock: Stock) -> str:
    """Label for MC options that avoids leaking the ticker symbol."""
    import re
    name = (stock.name or "").strip()
    ticker = (stock.ticker or "").strip()
    if name and ticker:
        # Remove any occurrence of the ticker from the display name so it
        # doesn't give the quiz away (e.g. "Apple Inc. (AAPL)" -> "Apple Inc.").
        cleaned = re.sub(rf"\s*[\(\[]?\b{re.escape(ticker)}\b[\)\]]?\s*", " ", name).strip(" -·,")
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        if cleaned:
            return cleaned
    if name:
        return name
    return f"Holding {stock.ticker[0] if stock.ticker else '?'}"


class ThesisOverviewItem(BaseModel):
    ticker: str
    thesis_id: int
    category: str
    statement: str
    importance: str
    conviction: str | None
    score: float | None  # latest eval score for this stock


@router.get("/thesis-overview", response_model=list[ThesisOverviewItem])
def portfolio_thesis_overview(portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Return all selected thesis points across the portfolio, with stock + latest score."""
    from app.models.thesis import Thesis

    portfolio = get_active_portfolio(portfolio_id, current_user, db)
    stocks = db.query(Stock).filter(Stock.portfolio_id == portfolio.id).all()
    stock_map = {s.id: s for s in stocks}
    stock_ids = list(stock_map.keys())
    if not stock_ids:
        return []

    theses = (
        db.query(Thesis)
        .filter(Thesis.stock_id.in_(stock_ids), Thesis.selected == True)  # noqa: E712
        .all()
    )

    # Get latest eval score per stock
    from sqlalchemy import func
    latest_evals = (
        db.query(Evaluation.stock_id, Evaluation.score)
        .filter(Evaluation.stock_id.in_(stock_ids))
        .distinct(Evaluation.stock_id)
        .order_by(Evaluation.stock_id, Evaluation.timestamp.desc())
        .all()
    )
    score_map = {row.stock_id: row.score for row in latest_evals}

    return [
        ThesisOverviewItem(
            ticker=stock_map[t.stock_id].ticker,
            thesis_id=t.id,
            category=t.category,
            statement=t.statement,
            importance=getattr(t, "importance", "standard") or "standard",
            conviction=getattr(t, "conviction", None),
            score=score_map.get(t.stock_id),
        )
        for t in theses
        if t.stock_id in stock_map
    ]


@router.get("/export/csv")
def export_portfolio_csv(portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Export all portfolio thesis points + latest scores as CSV."""
    import csv, io
    from app.models.thesis import Thesis
    from fastapi.responses import StreamingResponse as SR

    portfolio = get_active_portfolio(portfolio_id, current_user, db)
    stocks = db.query(Stock).filter(Stock.portfolio_id == portfolio.id).all()
    stock_map = {s.id: s for s in stocks}
    stock_ids = list(stock_map.keys())

    theses = (
        db.query(Thesis)
        .filter(Thesis.stock_id.in_(stock_ids), Thesis.selected == True)  # noqa: E712
        .order_by(Thesis.stock_id, Thesis.category)
        .all()
    ) if stock_ids else []

    latest_evals = (
        db.query(Evaluation.stock_id, Evaluation.score, Evaluation.status)
        .filter(Evaluation.stock_id.in_(stock_ids))
        .distinct(Evaluation.stock_id)
        .order_by(Evaluation.stock_id, Evaluation.timestamp.desc())
        .all()
    ) if stock_ids else []
    score_map = {row.stock_id: (row.score, row.status) for row in latest_evals}

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["ticker", "name", "score", "status", "category", "importance", "conviction", "statement"])
    for t in theses:
        stock = stock_map[t.stock_id]
        score, status = score_map.get(t.stock_id, (None, None))
        writer.writerow([
            stock.ticker, stock.name or stock.ticker,
            round(score, 1) if score is not None else "",
            status or "",
            t.category,
            getattr(t, "importance", "standard") or "standard",
            getattr(t, "conviction", None) or "",
            t.statement,
        ])

    buf.seek(0)
    return SR(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="thesisarc_{portfolio.name.replace(" ", "_")}.csv"'},
    )


SCREENER_TICKERS = [
    "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "BRK-B",
    "JPM", "V", "UNH", "XOM", "JNJ", "WMT", "PG", "MA", "HD", "CVX",
    "MRK", "LLY", "ABBV", "PEP", "COST", "AVGO", "CRM", "ACN", "TMO",
    "MCD", "ADBE", "NKE", "TXN", "QCOM", "HON", "NEE", "PM", "AMD",
    "INTC", "SCHW", "RTX", "LOW", "UPS", "CAT", "BA", "GS", "IBM",
    "SBUX", "PYPL", "NFLX", "DIS", "SPOT", "SQ", "COIN", "UBER", "LYFT",
    "SNAP", "RBLX", "HOOD", "PLTR", "SNOW", "DDOG", "ZS", "NET", "CRWD",
    "OKTA", "MDB", "TWLO", "ZM", "DOCU", "SHOP", "ABNB", "DASH", "RIVN",
    "LCID", "NIO", "BIDU", "BABA", "JD", "PDD", "TSM", "ASML", "SAP",
    "TM", "SONY", "ARM", "SMCI", "MSTR", "CELH", "HIMS", "RKLB", "IONQ",
]


class ScreenerCard(BaseModel):
    ticker: str
    name: str
    sector: str | None
    price: float | None
    change_pct: float | None  # 1-day change %
    pe_ratio: float | None
    market_cap: float | None  # in billions
    analyst_rating: str | None
    in_portfolio: bool
    in_watchlist: bool
    rationale: str


_RATING_LABELS: dict[str, str] = {
    "strong_buy": "Strong Buy consensus",
    "strongbuy": "Strong Buy consensus",
    "buy": "Buy consensus",
    "hold": "Hold consensus",
    "underperform": "Underperform consensus",
    "sell": "Sell consensus",
}


def _build_rationale(analyst_rating: str | None, pe_ratio: float | None, market_cap: float | None, sector: str | None) -> str:
    """Build a short, deterministic rationale string from available stock data."""
    parts: list[str] = []

    if analyst_rating:
        label = _RATING_LABELS.get(analyst_rating.lower().replace(" ", "_"))
        if label:
            parts.append(label)

    if pe_ratio and pe_ratio > 0:
        if pe_ratio < 15:
            parts.append(f"low P/E of {pe_ratio}")
        elif pe_ratio < 30:
            parts.append(f"reasonable P/E of {pe_ratio}")
        else:
            parts.append(f"high-growth P/E of {pe_ratio}")

    if market_cap:
        if market_cap >= 200:
            parts.append("large-cap stability")
        elif market_cap >= 10:
            parts.append("mid-cap growth profile")
        else:
            parts.append("small-cap opportunity")

    if sector:
        parts.append(f"in {sector} sector")

    if not parts:
        return "Popular stock for research"

    # Keep to 2-3 most relevant parts
    selected = parts[:3]
    if len(selected) == 1:
        return selected[0].capitalize()
    return f"{selected[0].capitalize()} with {' and '.join(selected[1:])}"


def _fetch_screener_card(ticker: str, portfolio_tickers: set, watchlist_tickers: set) -> "ScreenerCard | None":
    try:
        import yfinance as yf
        t = yf.Ticker(ticker)
        fast = t.fast_info
        full = t.info
        price = getattr(fast, "last_price", None)
        prev_close = getattr(fast, "previous_close", None)
        change_pct = round((price - prev_close) / prev_close * 100, 2) if price and prev_close else None
        market_cap_raw = getattr(fast, "market_cap", None)
        market_cap = round(market_cap_raw / 1e9, 1) if market_cap_raw else None
        analyst_rating = full.get("recommendationKey")
        pe_ratio = round(full.get("trailingPE", 0), 1) if full.get("trailingPE") else None
        sector = full.get("sector")
        return ScreenerCard(
            ticker=ticker,
            name=_clean_name(full.get("longName") or full.get("shortName") or ticker),
            sector=sector,
            price=round(price, 2) if price else None,
            change_pct=change_pct,
            pe_ratio=pe_ratio,
            market_cap=market_cap,
            analyst_rating=analyst_rating,
            in_portfolio=ticker in portfolio_tickers,
            in_watchlist=ticker in watchlist_tickers,
            rationale=_build_rationale(analyst_rating, pe_ratio, market_cap, sector),
        )
    except Exception:
        return None


@router.get("/screener", response_model=list[ScreenerCard])
def screener(portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Return a curated list of popular stocks with basic market data for the screener."""
    import random
    from concurrent.futures import ThreadPoolExecutor, as_completed

    portfolio = get_active_portfolio(portfolio_id, current_user, db)
    existing = db.query(Stock).filter(Stock.portfolio_id == portfolio.id).all()
    portfolio_tickers = {s.ticker for s in existing}
    watchlist_tickers = {s.ticker for s in existing if s.watchlist == "true"}

    dismissed: set[str] = set()
    if current_user.screener_dismissed:
        try:
            dismissed = set(json.loads(current_user.screener_dismissed))
        except Exception:
            pass

    candidates = [t for t in SCREENER_TICKERS if t not in portfolio_tickers and t not in dismissed]
    sample = random.sample(candidates, min(20, len(candidates)))

    cards: list[ScreenerCard] = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(_fetch_screener_card, t, portfolio_tickers, watchlist_tickers): t for t in sample}
        for future in as_completed(futures):
            result = future.result()
            if result:
                cards.append(result)

    cards.sort(key=lambda c: c.ticker)
    return cards


class PriceSnapshot(BaseModel):
    price: float | None
    change_pct: float | None
    fetched_at: float | None = None


@router.get("/prices", response_model=dict[str, PriceSnapshot])
def portfolio_prices(
    portfolio_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return current price + day change% for all portfolio stocks."""
    from app.utils.market_snapshot import get_snapshots_batch
    portfolio = get_active_portfolio(portfolio_id, current_user, db)
    stocks = db.query(Stock).filter(Stock.portfolio_id == portfolio.id).all()
    tickers = [s.ticker for s in stocks]

    snapshots = get_snapshots_batch(tickers)
    return {
        t: PriceSnapshot(price=s.price, change_pct=s.change_pct, fetched_at=s.fetched_at)
        for t, s in snapshots.items()
    }


@router.get("/evaluations")
def portfolio_evaluations(
    portfolio_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return latest evaluation for each stock in the portfolio (batch)."""
    from app.schemas.evaluation import EvaluationRead
    portfolio = get_active_portfolio(portfolio_id, current_user, db)
    stocks = db.query(Stock).filter(Stock.portfolio_id == portfolio.id).all()

    result: dict[str, dict] = {}
    for stock in stocks:
        evaluation = (
            db.query(Evaluation)
            .filter(Evaluation.stock_id == stock.id)
            .order_by(Evaluation.timestamp.desc())
            .first()
        )
        if evaluation:
            result[stock.ticker] = EvaluationRead.model_validate(evaluation).model_dump()

    return result


class DismissScreenerRequest(BaseModel):
    ticker: str


@router.post("/screener/dismiss", status_code=204)
def dismiss_screener_stock(
    body: DismissScreenerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a screener stock as dismissed so it won't appear again."""
    dismissed: list[str] = []
    if current_user.screener_dismissed:
        try:
            dismissed = json.loads(current_user.screener_dismissed)
        except Exception:
            pass
    if body.ticker not in dismissed:
        dismissed.append(body.ticker)
    current_user.screener_dismissed = json.dumps(dismissed)
    db.commit()


@router.get("/guidance")
def portfolio_guidance(
    portfolio_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return 1-3 actionable guidance strings based on current portfolio state."""
    from datetime import datetime, timezone, timedelta

    portfolio = get_active_portfolio(portfolio_id, current_user, db)
    stocks = db.query(Stock).filter(Stock.portfolio_id == portfolio.id).order_by(Stock.ticker).all()
    if not stocks:
        return {"guidance": []}

    stock_ids = [s.id for s in stocks]
    ticker_by_id = {s.id: s.ticker for s in stocks}

    latest_eval_ids = (
        db.query(func.max(Evaluation.id))
        .filter(Evaluation.stock_id.in_(stock_ids))
        .group_by(Evaluation.stock_id)
        .subquery()
    )
    latest_evals = {
        e.stock_id: e
        for e in db.query(Evaluation).filter(Evaluation.id.in_(latest_eval_ids)).all()
    }

    scored = [(ticker_by_id[sid], e.score, e.timestamp) for sid, e in latest_evals.items()]
    guidance: list[str] = []

    # Rule 1: weakest holding
    if scored:
        weakest_ticker, weakest_score, _ = min(scored, key=lambda x: x[1])
        guidance.append(
            f"Your weakest holding is {weakest_ticker} ({weakest_score:.1f}) — consider reviewing its thesis."
        )

    # Rule 2: stale evaluation (>3 days)
    now = datetime.now(tz=timezone.utc)
    stale_threshold = now - timedelta(days=3)
    stale = []
    for ticker, _score, ts in scored:
        if ts is not None:
            ts_aware = ts.replace(tzinfo=timezone.utc) if ts.tzinfo is None else ts
            if ts_aware < stale_threshold:
                days_old = (now - ts_aware).days
                stale.append((ticker, days_old))
    if stale:
        stale_ticker, days_old = max(stale, key=lambda x: x[1])
        guidance.append(
            f"{stale_ticker} hasn't been evaluated in {days_old} days — re-evaluate for fresh signals."
        )

    # Rule 3 / 4: avg score thresholds (only add if < 3 guidance items so far)
    if len(guidance) < 3 and scored:
        avg = sum(s for _, s, _ in scored) / len(scored)
        if avg < 50:
            guidance.append("Portfolio under pressure — consider whether your thesis points still hold.")
        elif avg > 75:
            guidance.append("Portfolio thesis is strong — stay the course.")

    return {"guidance": guidance[:3]}


@router.delete("/screener/dismissed", status_code=204)
def clear_screener_dismissed(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Clear all dismissed screener stocks."""
    current_user.screener_dismissed = None
    db.commit()
