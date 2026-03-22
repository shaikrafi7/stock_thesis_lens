from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.stock import Stock
from app.schemas.stock import StockCreate, StockRead

router = APIRouter(prefix="/stocks", tags=["stocks"])


def _lookup_company_name(ticker: str) -> str:
    """Fetch company name from Polygon. Returns ticker as fallback."""
    try:
        import httpx
        from app.core.config import settings
        if not settings.POLYGON_API_KEY:
            return ticker
        resp = httpx.get(
            f"https://api.polygon.io/v3/reference/tickers/{ticker}",
            params={"apiKey": settings.POLYGON_API_KEY},
            timeout=8,
        )
        if resp.status_code == 200:
            data = resp.json()
            return data.get("results", {}).get("name", ticker) or ticker
    except Exception:
        pass
    return ticker


@router.post("", response_model=StockRead, status_code=201)
def create_stock(payload: StockCreate, db: Session = Depends(get_db)):
    existing = db.query(Stock).filter(Stock.ticker == payload.ticker).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Stock '{payload.ticker}' already exists")

    name = payload.name if payload.name else _lookup_company_name(payload.ticker)

    stock = Stock(ticker=payload.ticker, name=name)
    db.add(stock)
    db.commit()
    db.refresh(stock)
    return stock


@router.get("", response_model=list[StockRead])
def list_stocks(db: Session = Depends(get_db)):
    return db.query(Stock).order_by(Stock.ticker).all()


@router.get("/{ticker}", response_model=StockRead)
def get_stock(ticker: str, db: Session = Depends(get_db)):
    stock = db.query(Stock).filter(Stock.ticker == ticker.upper()).first()
    if not stock:
        raise HTTPException(status_code=404, detail=f"Stock '{ticker.upper()}' not found")
    return stock


@router.delete("/{ticker}", status_code=204)
def delete_stock(ticker: str, db: Session = Depends(get_db)):
    stock = db.query(Stock).filter(Stock.ticker == ticker.upper()).first()
    if not stock:
        raise HTTPException(status_code=404, detail=f"Stock '{ticker.upper()}' not found")
    db.delete(stock)
    db.commit()
