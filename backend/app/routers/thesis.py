import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.stock import Stock
from app.models.thesis import Thesis
from app.models.user import User
from app.schemas.thesis import ThesisRead, ThesisUpdate, ThesisCreate, ChatRequest, ChatResponse, ThesisSuggestionSchema, GenerateAndEvaluateResponse, NewsItemSchema, ChatHistoryMessage, ThesisPreview, ConfirmPreviewRequest, ThesisAuditRead
from app.schemas.evaluation import EvaluationRead
from app.agents.thesis_generator import generate_thesis
from app.agents.thesis_chat_agent import chat as thesis_chat, chat_stream as thesis_chat_stream
from app.models.chat import ChatMessage as ChatMessageModel
from app.models.thesis_audit import ThesisAudit
from app.services.evaluation_service import run_evaluation_for_stock
from app.utils.market_snapshot import get_snapshot, format_snapshot
from app.utils.news import _fetch_polygon_news
from app.core.auth import get_current_user
from app.routers.stocks import get_user_stock

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stocks", tags=["thesis"])


def _get_investor_profile(user: User) -> dict | None:
    """Extract investor profile dict from user for passing to agents."""
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


@router.post("/{ticker}/preview-thesis", response_model=list[ThesisPreview])
def preview_stock_thesis(ticker: str, portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Generate thesis points without saving — for user review before committing."""
    stock = get_user_stock(ticker, current_user, db, portfolio_id)
    generated = generate_thesis(stock.ticker, stock.name, investor_profile=_get_investor_profile(current_user))
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
    evaluation_obj = run_evaluation_for_stock(stock, db, investor_profile=_get_investor_profile(current_user))
    evaluation = EvaluationRead.model_validate(evaluation_obj) if evaluation_obj else None

    return GenerateAndEvaluateResponse(
        theses=[ThesisRead.model_validate(t) for t in all_theses],
        evaluation=evaluation,
    )


@router.post("/{ticker}/generate-thesis", response_model=list[ThesisRead])
def generate_stock_thesis(ticker: str, portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    stock = get_user_stock(ticker, current_user, db, portfolio_id)

    db.query(Thesis).filter(Thesis.stock_id == stock.id).delete()

    generated = generate_thesis(stock.ticker, stock.name, investor_profile=_get_investor_profile(current_user))

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

    generated = generate_thesis(stock.ticker, stock.name, investor_profile=_get_investor_profile(current_user))

    preserved_statements = {t.statement for t in preserved_points}

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

    evaluation_obj = run_evaluation_for_stock(stock, db, investor_profile=_get_investor_profile(current_user))
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
def get_theses(ticker: str, portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    stock = get_user_stock(ticker, current_user, db, portfolio_id)
    return db.query(Thesis).filter(Thesis.stock_id == stock.id).all()


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
        investor_profile=_get_investor_profile(current_user),
    )

    return ChatResponse(
        message=result.message,
        suggestion=ThesisSuggestionSchema(
            category=result.suggestion.category,
            statement=result.suggestion.statement,
        ) if result.suggestion else None,
    )


@router.post("/{ticker}/chat/stream")
def chat_with_assistant_stream(ticker: str, payload: ChatRequest, portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
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

    # Collect all events first, then stream + persist
    all_events = list(thesis_chat_stream(
        stock.ticker, stock.name, thesis_dicts, messages,
        market_data=market_data,
        recent_news=recent_news,
        investor_profile=_get_investor_profile(current_user),
    ))
    accumulated = "".join(
        e["data"].get("content", "") or e["data"].get("text", "")
        for e in all_events if e["event"] == "token"
    )

    def event_generator():
        for event in all_events:
            yield f"event: {event['event']}\ndata: {json.dumps(event['data'])}\n\n"

    # Persist before streaming — guarantees it runs
    try:
        user_content = messages[-1]["content"] if messages else ""
        if user_content:
            db.add(ChatMessageModel(context_key=context_key, role="user", content=user_content, user_id=user_id))
        if accumulated:
            db.add(ChatMessageModel(context_key=context_key, role="assistant", content=accumulated, user_id=user_id))
        db.commit()
    except Exception:
        logger.warning("Failed to persist chat for %s", context_key)

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
