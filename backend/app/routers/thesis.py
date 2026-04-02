import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.stock import Stock
from app.models.thesis import Thesis
from app.models.user import User
from app.schemas.thesis import ThesisRead, ThesisUpdate, ThesisCreate, ChatRequest, ChatResponse, ThesisSuggestionSchema, GenerateAndEvaluateResponse, NewsItemSchema, ChatHistoryMessage
from app.schemas.evaluation import EvaluationRead
from app.agents.thesis_generator import generate_thesis
from app.agents.thesis_chat_agent import chat as thesis_chat, chat_stream as thesis_chat_stream
from app.models.chat import ChatMessage as ChatMessageModel
from app.services.evaluation_service import run_evaluation_for_stock
from app.utils.market_snapshot import get_snapshot, format_snapshot
from app.utils.news import _fetch_polygon_news
from app.core.auth import get_current_user
from app.routers.stocks import get_user_stock

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stocks", tags=["thesis"])


@router.post("/{ticker}/generate-thesis", response_model=list[ThesisRead])
def generate_stock_thesis(ticker: str, portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    stock = get_user_stock(ticker, current_user, db, portfolio_id)

    db.query(Thesis).filter(Thesis.stock_id == stock.id).delete()

    generated = generate_thesis(stock.ticker, stock.name)

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

    generated = generate_thesis(stock.ticker, stock.name)

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

    evaluation_obj = run_evaluation_for_stock(stock, db)
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

    if payload.selected is not None:
        thesis.selected = payload.selected
    if payload.statement is not None:
        thesis.statement = payload.statement
    if payload.frozen is not None:
        thesis.frozen = payload.frozen
    if payload.importance is not None:
        thesis.importance = payload.importance

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


@router.delete("/{ticker}/theses/{thesis_id}", status_code=204)
def delete_thesis(ticker: str, thesis_id: int, portfolio_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    stock = get_user_stock(ticker, current_user, db, portfolio_id)

    thesis = db.query(Thesis).filter(Thesis.id == thesis_id, Thesis.stock_id == stock.id).first()
    if not thesis:
        raise HTTPException(status_code=404, detail=f"Thesis {thesis_id} not found for {stock.ticker}")

    db.delete(thesis)
    db.commit()
    return None
