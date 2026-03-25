import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.stock import Stock
from app.models.thesis import Thesis
from app.schemas.thesis import ThesisRead, ThesisUpdate, ThesisCreate, ChatRequest, ChatResponse, ThesisSuggestionSchema, GenerateAndEvaluateResponse
from app.schemas.evaluation import EvaluationRead
from app.agents.thesis_generator import generate_thesis
from app.agents.thesis_chat_agent import chat as thesis_chat, chat_stream as thesis_chat_stream
from app.services.evaluation_service import run_evaluation_for_stock
from app.utils.market_snapshot import get_snapshot, format_snapshot
from app.utils.news import _search_one_ticker

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stocks", tags=["thesis"])


@router.post("/{ticker}/generate-thesis", response_model=list[ThesisRead])
def generate_stock_thesis(ticker: str, db: Session = Depends(get_db)):
    ticker = ticker.upper()
    stock = db.query(Stock).filter(Stock.ticker == ticker).first()
    if not stock:
        raise HTTPException(status_code=404, detail=f"Stock '{ticker}' not found. Add it first via POST /stocks.")

    # Preserve any selections the user already made
    existing = db.query(Thesis).filter(Thesis.stock_id == stock.id).all()
    previously_selected: set[str] = {t.statement for t in existing if t.selected}

    db.query(Thesis).filter(Thesis.stock_id == stock.id).delete()

    generated = generate_thesis(ticker, stock.name)

    theses = [
        Thesis(
            stock_id=stock.id,
            category=item.category,
            statement=item.statement,
            weight=item.weight,
            importance=item.importance,
            selected=True,  # all points auto-selected
        )
        for item in generated
    ]
    db.add_all(theses)
    db.commit()
    for t in theses:
        db.refresh(t)

    return theses


@router.post("/{ticker}/generate-and-evaluate", response_model=GenerateAndEvaluateResponse)
def generate_and_evaluate(ticker: str, db: Session = Depends(get_db)):
    """Generate thesis (all points auto-selected), then run evaluation."""
    ticker = ticker.upper()
    stock = db.query(Stock).filter(Stock.ticker == ticker).first()
    if not stock:
        raise HTTPException(status_code=404, detail=f"Stock '{ticker}' not found. Add it first via POST /stocks.")

    # Preserve frozen + manually added points from previous generation
    existing = db.query(Thesis).filter(Thesis.stock_id == stock.id).all()
    preserved_points = [t for t in existing if t.frozen or getattr(t, "source", "ai") == "manual"]

    # Delete only AI-generated, non-frozen points
    for t in existing:
        if not t.frozen and getattr(t, "source", "ai") != "manual":
            db.delete(t)
    db.flush()

    generated = generate_thesis(ticker, stock.name)

    # Avoid duplicating preserved points (by statement text)
    preserved_statements = {t.statement for t in preserved_points}

    theses = [
        Thesis(
            stock_id=stock.id,
            category=item.category,
            statement=item.statement,
            weight=item.weight,
            importance=item.importance,
            selected=True,  # all points auto-selected
        )
        for item in generated
        if item.statement not in preserved_statements
    ]
    db.add_all(theses)
    db.commit()

    # Refresh all (including preserved frozen)
    all_theses = db.query(Thesis).filter(Thesis.stock_id == stock.id).all()

    # Run evaluation
    evaluation_obj = run_evaluation_for_stock(stock, db)
    evaluation = EvaluationRead.model_validate(evaluation_obj) if evaluation_obj else None

    return GenerateAndEvaluateResponse(
        theses=[ThesisRead.model_validate(t) for t in all_theses],
        evaluation=evaluation,
    )


@router.post("/{ticker}/theses", response_model=ThesisRead, status_code=201)
def add_manual_thesis(ticker: str, payload: ThesisCreate, db: Session = Depends(get_db)):
    ticker = ticker.upper()
    stock = db.query(Stock).filter(Stock.ticker == ticker).first()
    if not stock:
        raise HTTPException(status_code=404, detail=f"Stock '{ticker}' not found")

    thesis = Thesis(
        stock_id=stock.id,
        category=payload.category,
        statement=payload.statement,
        weight=1.0,
        selected=True,  # auto-select manual points
        source="manual",
    )
    db.add(thesis)
    db.commit()
    db.refresh(thesis)
    return thesis


@router.get("/{ticker}/theses", response_model=list[ThesisRead])
def get_theses(ticker: str, db: Session = Depends(get_db)):
    ticker = ticker.upper()
    stock = db.query(Stock).filter(Stock.ticker == ticker).first()
    if not stock:
        raise HTTPException(status_code=404, detail=f"Stock '{ticker}' not found")
    return db.query(Thesis).filter(Thesis.stock_id == stock.id).all()


@router.post("/{ticker}/chat", response_model=ChatResponse)
def chat_with_assistant(ticker: str, payload: ChatRequest, db: Session = Depends(get_db)):
    ticker = ticker.upper()
    stock = db.query(Stock).filter(Stock.ticker == ticker).first()
    if not stock:
        raise HTTPException(status_code=404, detail=f"Stock '{ticker}' not found")

    existing_theses = db.query(Thesis).filter(Thesis.stock_id == stock.id).all()
    thesis_dicts = [{"category": t.category, "statement": t.statement} for t in existing_theses]
    messages = [{"role": m.role, "content": m.content} for m in payload.messages]

    # Fetch live market data and recent news for richer chat context
    snap = get_snapshot(ticker)
    market_data = format_snapshot(snap)
    try:
        recent_news = _search_one_ticker(ticker, stock.name, limit=3)
    except Exception:
        recent_news = []

    result = thesis_chat(
        ticker, stock.name, thesis_dicts, messages,
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
def chat_with_assistant_stream(ticker: str, payload: ChatRequest, db: Session = Depends(get_db)):
    ticker = ticker.upper()
    stock = db.query(Stock).filter(Stock.ticker == ticker).first()
    if not stock:
        raise HTTPException(status_code=404, detail=f"Stock '{ticker}' not found")

    existing_theses = db.query(Thesis).filter(Thesis.stock_id == stock.id).all()
    thesis_dicts = [{"category": t.category, "statement": t.statement} for t in existing_theses]
    messages = [{"role": m.role, "content": m.content} for m in payload.messages]

    snap = get_snapshot(ticker)
    market_data = format_snapshot(snap)
    try:
        recent_news = _search_one_ticker(ticker, stock.name, limit=3)
    except Exception:
        recent_news = []

    def event_generator():
        for event in thesis_chat_stream(
            ticker, stock.name, thesis_dicts, messages,
            market_data=market_data,
            recent_news=recent_news,
        ):
            yield f"event: {event['event']}\ndata: {json.dumps(event['data'])}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.patch("/{ticker}/theses/{thesis_id}", response_model=ThesisRead)
def update_thesis(ticker: str, thesis_id: int, payload: ThesisUpdate, db: Session = Depends(get_db)):
    ticker = ticker.upper()
    stock = db.query(Stock).filter(Stock.ticker == ticker).first()
    if not stock:
        raise HTTPException(status_code=404, detail=f"Stock '{ticker}' not found")

    thesis = db.query(Thesis).filter(Thesis.id == thesis_id, Thesis.stock_id == stock.id).first()
    if not thesis:
        raise HTTPException(status_code=404, detail=f"Thesis {thesis_id} not found for {ticker}")

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


@router.delete("/{ticker}/theses/{thesis_id}", status_code=204)
def delete_thesis(ticker: str, thesis_id: int, db: Session = Depends(get_db)):
    ticker = ticker.upper()
    stock = db.query(Stock).filter(Stock.ticker == ticker).first()
    if not stock:
        raise HTTPException(status_code=404, detail=f"Stock '{ticker}' not found")

    thesis = db.query(Thesis).filter(Thesis.id == thesis_id, Thesis.stock_id == stock.id).first()
    if not thesis:
        raise HTTPException(status_code=404, detail=f"Thesis {thesis_id} not found for {ticker}")

    db.delete(thesis)
    db.commit()
    return None
