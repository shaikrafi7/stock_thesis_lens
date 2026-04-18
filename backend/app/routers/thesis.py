import json
import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.stock import Stock
from app.models.thesis import Thesis
from app.models.user import User
from app.schemas.thesis import ThesisRead, ThesisUpdate, ThesisCreate, ChatRequest, ChatResponse, ThesisSuggestionSchema, GenerateAndEvaluateResponse, NewsItemSchema, ChatHistoryMessage, ThesisPreview, ConfirmPreviewRequest, ThesisAuditRead, BacktestPoint, ThesisCloseRequest, ClosedThesisEntry
from app.schemas.evaluation import EvaluationRead
from app.agents.thesis_generator import generate_thesis
from app.agents.thesis_chat_agent import chat as thesis_chat, chat_stream as thesis_chat_stream
from app.models.chat import ChatMessage as ChatMessageModel
from app.models.thesis_audit import ThesisAudit
from app.services.evaluation_service import run_evaluation_for_stock
from app.utils.market_snapshot import get_snapshot, format_snapshot
from app.utils.news import _fetch_polygon_news
from app.core.auth import get_current_user
from app.core.utils import get_investor_profile
from app.routers.stocks import get_user_stock

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stocks", tags=["thesis"])




@router.post("/{ticker}/preview-thesis", response_model=list[ThesisPreview])
def preview_stock_thesis(ticker: str, portfolio_id: int | None = Query(None), max_groups: int | None = Query(None, ge=1, le=6), max_per_group: int | None = Query(None, ge=1, le=5), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Generate thesis points without saving — for user review before committing."""
    stock = get_user_stock(ticker, current_user, db, portfolio_id)
    existing_stmts = [t.statement for t in db.query(Thesis).filter(Thesis.stock_id == stock.id).all()]
    generated = generate_thesis(
        stock.ticker, stock.name,
        investor_profile=get_investor_profile(current_user),
        existing_statements=existing_stmts,
        max_groups=max_groups or 5,
        max_per_group=max_per_group or 2,
    )
    return [ThesisPreview(category=g.category, statement=g.statement, importance=g.importance, weight=g.weight) for g in generated]


@router.post("/{ticker}/confirm-preview", response_model=GenerateAndEvaluateResponse)
def confirm_preview(ticker: str, payload: ConfirmPreviewRequest, portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Save exactly the user-approved preview points, preserving frozen/manual, then evaluate."""
    stock = get_user_stock(ticker, current_user, db, portfolio_id)

    existing = db.query(Thesis).filter(Thesis.stock_id == stock.id).all()
    preserved = [t for t in existing if t.frozen or getattr(t, "source", "ai") == "manual"]
    for t in existing:
        if not t.frozen and getattr(t, "source", "ai") != "manual":
            db.delete(t)
    db.flush()

    preserved_statements = {t.statement for t in preserved}
    new_theses = [
        Thesis(
            stock_id=stock.id,
            category=p.category,
            statement=p.statement,
            weight=p.weight,
            importance=p.importance,
            selected=True,
        )
        for p in payload.points
        if p.statement not in preserved_statements
    ]
    db.add_all(new_theses)
    db.commit()

    all_theses = db.query(Thesis).filter(Thesis.stock_id == stock.id).all()
    evaluation_obj = run_evaluation_for_stock(stock, db, investor_profile=get_investor_profile(current_user))
    evaluation = EvaluationRead.model_validate(evaluation_obj) if evaluation_obj else None

    return GenerateAndEvaluateResponse(
        theses=[ThesisRead.model_validate(t) for t in all_theses],
        evaluation=evaluation,
    )


@router.post("/{ticker}/generate-thesis", response_model=list[ThesisRead])
def generate_stock_thesis(ticker: str, portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    stock = get_user_stock(ticker, current_user, db, portfolio_id)

    db.query(Thesis).filter(Thesis.stock_id == stock.id).delete()

    generated = generate_thesis(stock.ticker, stock.name, investor_profile=get_investor_profile(current_user))

    theses = [
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
    db.add_all(theses)
    db.commit()
    for t in theses:
        db.refresh(t)

    return theses


@router.post("/{ticker}/generate-and-evaluate", response_model=GenerateAndEvaluateResponse)
def generate_and_evaluate(ticker: str, portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    stock = get_user_stock(ticker, current_user, db, portfolio_id)

    existing = db.query(Thesis).filter(Thesis.stock_id == stock.id).all()
    preserved_points = [t for t in existing if t.frozen or getattr(t, "source", "ai") == "manual"]

    for t in existing:
        if not t.frozen and getattr(t, "source", "ai") != "manual":
            db.delete(t)
    db.flush()

    preserved_statements = {t.statement for t in preserved_points}
    generated = generate_thesis(stock.ticker, stock.name, investor_profile=get_investor_profile(current_user), existing_statements=list(preserved_statements))

    theses = [
        Thesis(
            stock_id=stock.id,
            category=item.category,
            statement=item.statement,
            weight=item.weight,
            importance=item.importance,
            selected=True,
        )
        for item in generated
        if item.statement not in preserved_statements
    ]
    db.add_all(theses)
    db.commit()

    all_theses = db.query(Thesis).filter(Thesis.stock_id == stock.id).all()

    evaluation_obj = run_evaluation_for_stock(stock, db, investor_profile=get_investor_profile(current_user))
    evaluation = EvaluationRead.model_validate(evaluation_obj) if evaluation_obj else None

    return GenerateAndEvaluateResponse(
        theses=[ThesisRead.model_validate(t) for t in all_theses],
        evaluation=evaluation,
    )


@router.post("/{ticker}/theses", response_model=ThesisRead, status_code=201)
def add_manual_thesis(ticker: str, payload: ThesisCreate, portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    stock = get_user_stock(ticker, current_user, db, portfolio_id)

    thesis = Thesis(
        stock_id=stock.id,
        category=payload.category,
        statement=payload.statement,
        weight=1.0,
        selected=True,
        source="manual",
    )
    db.add(thesis)
    db.flush()
    db.add(ThesisAudit(
        thesis_id=thesis.id, stock_id=stock.id, user_id=current_user.id,
        action="created", statement_snapshot=thesis.statement, category=thesis.category,
    ))
    db.commit()
    db.refresh(thesis)
    return thesis


@router.get("/{ticker}/theses", response_model=list[ThesisRead])
def get_theses(
    ticker: str,
    portfolio_id: int | None = Query(None),
    include_closed: bool = Query(False, description="Include closed/post-mortem theses."),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stock = get_user_stock(ticker, current_user, db, portfolio_id)
    q = db.query(Thesis).filter(Thesis.stock_id == stock.id)
    if not include_closed:
        q = q.filter(Thesis.closed_at.is_(None))
    return q.all()


@router.post("/{ticker}/chat", response_model=ChatResponse)
def chat_with_assistant(ticker: str, payload: ChatRequest, portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    stock = get_user_stock(ticker, current_user, db, portfolio_id)

    existing_theses = db.query(Thesis).filter(Thesis.stock_id == stock.id).all()
    thesis_dicts = [{"category": t.category, "statement": t.statement} for t in existing_theses]
    messages = [{"role": m.role, "content": m.content} for m in payload.messages]

    snap = get_snapshot(stock.ticker)
    market_data = format_snapshot(snap)
    try:
        recent_news = _fetch_polygon_news(stock.ticker, limit=3)
    except Exception:
        recent_news = []

    result = thesis_chat(
        stock.ticker, stock.name, thesis_dicts, messages,
        market_data=market_data,
        recent_news=recent_news,
        investor_profile=get_investor_profile(current_user),
    )

    return ChatResponse(
        message=result.message,
        suggestion=ThesisSuggestionSchema(
            category=result.suggestion.category,
            statement=result.suggestion.statement,
        ) if result.suggestion else None,
    )


@router.post("/{ticker}/chat/stream")
def chat_with_assistant_stream(ticker: str, payload: ChatRequest, background_tasks: BackgroundTasks, portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    stock = get_user_stock(ticker, current_user, db, portfolio_id)

    existing_theses = db.query(Thesis).filter(Thesis.stock_id == stock.id).all()
    thesis_dicts = [{"category": t.category, "statement": t.statement} for t in existing_theses]
    messages = [{"role": m.role, "content": m.content} for m in payload.messages]

    snap = get_snapshot(stock.ticker)
    market_data = format_snapshot(snap)
    try:
        recent_news = _fetch_polygon_news(stock.ticker, limit=3)
    except Exception:
        recent_news = []

    user_id = current_user.id
    context_key = stock.ticker
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
        except Exception:
            logger.warning("Failed to persist chat for %s", context_key)
        finally:
            session.close()

    def event_generator():
        tokens = []
        for event in thesis_chat_stream(
            stock.ticker, stock.name, thesis_dicts, messages,
            market_data=market_data,
            recent_news=recent_news,
            investor_profile=get_investor_profile(current_user),
        ):
            if event["event"] == "token":
                tokens.append(event["data"].get("content", "") or event["data"].get("text", ""))
            yield f"event: {event['event']}\ndata: {json.dumps(event['data'])}\n\n"
        background_tasks.add_task(_persist, "".join(tokens))

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.patch("/{ticker}/theses/{thesis_id}", response_model=ThesisRead)
def update_thesis(ticker: str, thesis_id: int, payload: ThesisUpdate, portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    stock = get_user_stock(ticker, current_user, db, portfolio_id)

    thesis = db.query(Thesis).filter(Thesis.id == thesis_id, Thesis.stock_id == stock.id).first()
    if not thesis:
        raise HTTPException(status_code=404, detail=f"Thesis {thesis_id} not found for {stock.ticker}")

    def _audit(action: str, field: str | None = None, old: str | None = None, new: str | None = None):
        db.add(ThesisAudit(
            thesis_id=thesis.id, stock_id=thesis.stock_id, user_id=current_user.id,
            action=action, field_changed=field, old_value=old, new_value=new,
            statement_snapshot=thesis.statement, category=thesis.category,
        ))

    if payload.selected is not None and payload.selected != thesis.selected:
        _audit("updated", "selected", str(thesis.selected), str(payload.selected))
        thesis.selected = payload.selected
    if payload.statement is not None and payload.statement != thesis.statement:
        _audit("updated", "statement", thesis.statement, payload.statement)
        thesis.statement = payload.statement
    if payload.frozen is not None and payload.frozen != thesis.frozen:
        _audit("frozen" if payload.frozen else "unfrozen")
        thesis.frozen = payload.frozen
    if payload.importance is not None and payload.importance != thesis.importance:
        _audit("updated", "importance", thesis.importance, payload.importance)
        thesis.importance = payload.importance
    if payload.clear_conviction:
        if thesis.conviction:
            _audit("conviction_cleared", "conviction", thesis.conviction, None)
        thesis.conviction = None
    elif payload.conviction is not None and payload.conviction != thesis.conviction:
        _audit("liked" if payload.conviction == "liked" else "disliked", "conviction", thesis.conviction, payload.conviction)
        thesis.conviction = payload.conviction

    db.commit()
    db.refresh(thesis)
    return thesis


@router.get("/{ticker}/news", response_model=list[NewsItemSchema])
def get_stock_news(ticker: str, portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    stock = get_user_stock(ticker, current_user, db, portfolio_id)

    articles = _fetch_polygon_news(stock.ticker, limit=5, days=3)
    return [
        NewsItemSchema(
            title=a.get("title", ""),
            url=a.get("url", ""),
            published_utc=a.get("published_utc", ""),
        )
        for a in articles
        if a.get("title")
    ]


@router.get("/{ticker}/chat/history", response_model=list[ChatHistoryMessage])
def get_chat_history(ticker: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    ticker = ticker.upper()
    messages = (
        db.query(ChatMessageModel)
        .filter(ChatMessageModel.context_key == ticker, ChatMessageModel.user_id == current_user.id)
        .order_by(ChatMessageModel.created_at.asc())
        .limit(40)
        .all()
    )
    return [ChatHistoryMessage(role=m.role, content=m.content) for m in messages]


@router.delete("/{ticker}/chat/history", status_code=204)
def clear_chat_history(ticker: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    ticker = ticker.upper()
    db.query(ChatMessageModel).filter(
        ChatMessageModel.context_key == ticker, ChatMessageModel.user_id == current_user.id
    ).delete()
    db.commit()
    return None


@router.post("/{ticker}/theses/reorder", status_code=204)
def reorder_theses(ticker: str, payload: list[dict], portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Accept [{id, sort_order}, ...] and persist ordering."""
    stock = get_user_stock(ticker, current_user, db, portfolio_id)
    for item in payload:
        db.query(Thesis).filter(Thesis.id == item["id"], Thesis.stock_id == stock.id).update(
            {Thesis.sort_order: item["sort_order"]}, synchronize_session=False
        )
    db.commit()
    return None


@router.delete("/{ticker}/theses/{thesis_id}", status_code=204)
def delete_thesis(ticker: str, thesis_id: int, portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    stock = get_user_stock(ticker, current_user, db, portfolio_id)

    thesis = db.query(Thesis).filter(Thesis.id == thesis_id, Thesis.stock_id == stock.id).first()
    if not thesis:
        raise HTTPException(status_code=404, detail=f"Thesis {thesis_id} not found for {stock.ticker}")

    db.add(ThesisAudit(
        thesis_id=thesis.id, stock_id=thesis.stock_id, user_id=current_user.id,
        action="deleted", statement_snapshot=thesis.statement, category=thesis.category,
    ))
    db.delete(thesis)
    db.commit()
    return None


@router.get("/{ticker}/audit", response_model=list[ThesisAuditRead])
def get_thesis_audit(ticker: str, portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Return full audit log for a stock's thesis history."""
    stock = get_user_stock(ticker, current_user, db, portfolio_id)
    audits = (
        db.query(ThesisAudit)
        .filter(ThesisAudit.stock_id == stock.id, ThesisAudit.user_id == current_user.id)
        .order_by(ThesisAudit.created_at.desc())
        .limit(100)
        .all()
    )
    return audits


@router.post("/{ticker}/theses/{thesis_id}/close", response_model=ThesisRead)
def close_thesis(
    ticker: str,
    thesis_id: int,
    payload: ThesisCloseRequest,
    portfolio_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Close a thesis with a post-mortem record.

    Sets closed_at, outcome, and lessons on the thesis, and logs an audit
    entry with action='closed'. Closed theses are hidden from the active
    list but retained for the journal view.
    """
    from datetime import datetime
    stock = get_user_stock(ticker, current_user, db, portfolio_id)
    thesis = db.query(Thesis).filter(Thesis.id == thesis_id, Thesis.stock_id == stock.id).first()
    if not thesis:
        raise HTTPException(status_code=404, detail=f"Thesis {thesis_id} not found for {stock.ticker}")
    if thesis.closed_at is not None:
        raise HTTPException(status_code=400, detail="Thesis is already closed.")

    now = datetime.utcnow()
    thesis.closed_at = now
    thesis.outcome = payload.outcome
    thesis.lessons = payload.lessons

    db.add(ThesisAudit(
        thesis_id=thesis.id,
        stock_id=thesis.stock_id,
        user_id=current_user.id,
        action="closed",
        field_changed="outcome",
        old_value=None,
        new_value=payload.outcome,
        statement_snapshot=thesis.statement,
        category=thesis.category,
        note=payload.lessons,
    ))
    db.commit()
    db.refresh(thesis)
    return thesis


@router.post("/{ticker}/theses/{thesis_id}/reopen", response_model=ThesisRead)
def reopen_thesis(
    ticker: str,
    thesis_id: int,
    portfolio_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reopen a closed thesis. Clears closure fields; keeps the audit entry."""
    stock = get_user_stock(ticker, current_user, db, portfolio_id)
    thesis = db.query(Thesis).filter(Thesis.id == thesis_id, Thesis.stock_id == stock.id).first()
    if not thesis:
        raise HTTPException(status_code=404, detail=f"Thesis {thesis_id} not found for {stock.ticker}")
    if thesis.closed_at is None:
        raise HTTPException(status_code=400, detail="Thesis is not closed.")

    prior_outcome = thesis.outcome
    thesis.closed_at = None
    thesis.outcome = None
    thesis.lessons = None
    db.add(ThesisAudit(
        thesis_id=thesis.id,
        stock_id=thesis.stock_id,
        user_id=current_user.id,
        action="reopened",
        field_changed="outcome",
        old_value=prior_outcome,
        new_value=None,
        statement_snapshot=thesis.statement,
        category=thesis.category,
    ))
    db.commit()
    db.refresh(thesis)
    return thesis


@router.get("/{ticker}/backtest", response_model=list[BacktestPoint])
def backtest_thesis(
    ticker: str,
    portfolio_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return historical thesis scores with forward price returns at +30/90/180 days."""
    import yfinance as yf
    from app.models.evaluation import Evaluation
    from datetime import timedelta, timezone

    stock = get_user_stock(ticker, current_user, db, portfolio_id)
    evals = (
        db.query(Evaluation)
        .filter(Evaluation.stock_id == stock.id)
        .order_by(Evaluation.evaluated_at.asc())
        .all()
    )
    if not evals:
        return []

    # Fetch 2 years of daily history to cover 180d forward from old evals
    hist = yf.Ticker(ticker).history(period="2y")
    if hist.empty:
        return []

    # Build date -> close price map (UTC date string)
    price_map: dict[str, float] = {}
    for ts, row in hist.iterrows():
        price_map[ts.strftime("%Y-%m-%d")] = float(row["Close"])

    sorted_dates = sorted(price_map.keys())

    def nearest_price(target_date: str) -> Optional[float]:
        """Find closest available trading day price on or after target_date."""
        for d in sorted_dates:
            if d >= target_date:
                return price_map[d]
        return None

    results: list[BacktestPoint] = []
    for ev in evals:
        ev_dt = ev.evaluated_at
        if ev_dt.tzinfo is None:
            ev_dt = ev_dt.replace(tzinfo=timezone.utc)
        eval_date = ev_dt.strftime("%Y-%m-%d")
        p0 = nearest_price(eval_date)

        def fwd_return(days: int) -> Optional[float]:
            if p0 is None:
                return None
            fwd_date = (ev_dt + timedelta(days=days)).strftime("%Y-%m-%d")
            p1 = nearest_price(fwd_date)
            if p1 is None:
                return None
            return round((p1 - p0) / p0 * 100, 2)

        results.append(BacktestPoint(
            date=eval_date,
            score=ev.score,
            status=ev.status,
            price_at_eval=round(p0, 2) if p0 else None,
            return_30d=fwd_return(30),
            return_90d=fwd_return(90),
            return_180d=fwd_return(180),
        ))

    return results
