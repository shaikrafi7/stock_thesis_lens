from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.stock import Stock
from app.models.thesis import Thesis
from app.schemas.thesis import ThesisRead, ThesisUpdate, ThesisCreate, ChatRequest, ChatResponse, ThesisSuggestionSchema
from app.agents.thesis_generator import generate_thesis
from app.agents.thesis_chat_agent import chat as thesis_chat

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
            selected=item.statement in previously_selected,
        )
        for item in generated
    ]
    db.add_all(theses)
    db.commit()
    for t in theses:
        db.refresh(t)

    return theses


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

    result = thesis_chat(ticker, stock.name, thesis_dicts, messages)

    return ChatResponse(
        message=result.message,
        suggestion=ThesisSuggestionSchema(
            category=result.suggestion.category,
            statement=result.suggestion.statement,
        ) if result.suggestion else None,
    )


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
