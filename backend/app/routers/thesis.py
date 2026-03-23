from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.stock import Stock
from app.models.thesis import Thesis
from app.schemas.thesis import ThesisRead, ThesisUpdate, ThesisCreate
from app.agents.thesis_generator import generate_thesis

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


@router.patch("/{ticker}/theses/{thesis_id}", response_model=ThesisRead)
def update_thesis_selection(ticker: str, thesis_id: int, payload: ThesisUpdate, db: Session = Depends(get_db)):
    ticker = ticker.upper()
    stock = db.query(Stock).filter(Stock.ticker == ticker).first()
    if not stock:
        raise HTTPException(status_code=404, detail=f"Stock '{ticker}' not found")

    thesis = db.query(Thesis).filter(Thesis.id == thesis_id, Thesis.stock_id == stock.id).first()
    if not thesis:
        raise HTTPException(status_code=404, detail=f"Thesis {thesis_id} not found for {ticker}")

    thesis.selected = payload.selected
    db.commit()
    db.refresh(thesis)
    return thesis
