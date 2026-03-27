import re
import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.stock import Stock
from app.schemas.stock import StockCreate, StockRead
from app.core.config import settings

router = APIRouter(prefix="/stocks", tags=["stocks"])

# Valid ticker: 1–10 chars, starts with a letter, allows letters/digits/dots/dashes
_TICKER_RE = re.compile(r'^[A-Z][A-Z0-9\.\-]{0,9}$')

_NAME_SUFFIX_RE = re.compile(
    r"\s*[-–—]?\s*(Class\s+[A-Z]\s+)?(Common\s+Stock|Ordinary\s+Shares?|American\s+Depositary\s+Shares?|ADR).*$",
    re.IGNORECASE,
)

def _clean_name(raw: str) -> str:
    cleaned = _NAME_SUFFIX_RE.sub("", raw).strip().rstrip(",").strip()
    return cleaned or raw


def _validate_and_get_metadata(ticker: str) -> tuple[str, str | None]:
    """Validate ticker format and existence via Polygon.

    Returns (company_name, logo_url).
    Raises HTTPException 422 if format is invalid or Polygon says ticker doesn't exist.
    Falls back gracefully on Polygon errors or missing key.
    """
    if not _TICKER_RE.match(ticker):
        raise HTTPException(
            status_code=422,
            detail=(
                f"'{ticker}' is not a valid ticker symbol. "
                "Enter a stock ticker like AAPL, NVDA, or BRK.B — not a company name."
            ),
        )

    if not settings.POLYGON_API_KEY:
        return ticker, None  # can't validate without key; allow through

    try:
        resp = httpx.get(
            f"https://api.polygon.io/v3/reference/tickers/{ticker}",
            params={"apiKey": settings.POLYGON_API_KEY},
            timeout=8,
        )
        if resp.status_code == 200:
            results = resp.json().get("results", {})
            name = _clean_name(results.get("name", ticker) or ticker)
            icon_url = results.get("branding", {}).get("icon_url")
            logo_url = f"{icon_url}?apiKey={settings.POLYGON_API_KEY}" if icon_url else None
            return name, logo_url
        elif resp.status_code == 404:
            raise HTTPException(
                status_code=422,
                detail=f"Ticker '{ticker}' was not found. Please check the symbol and try again.",
            )
    except HTTPException:
        raise
    except Exception:
        pass

    return ticker, None  # Polygon error → don't block user on API outage


@router.post("", response_model=StockRead, status_code=201)
def create_stock(payload: StockCreate, db: Session = Depends(get_db)):
    existing = db.query(Stock).filter(Stock.ticker == payload.ticker).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Stock '{payload.ticker}' already exists")

    # If name is supplied (e.g. in tests), skip Polygon validation.
    # In the normal frontend flow, name is always empty and validation runs.
    if payload.name:
        name, logo_url = payload.name, None
    else:
        name, logo_url = _validate_and_get_metadata(payload.ticker)

    stock = Stock(ticker=payload.ticker, name=name, logo_url=logo_url)
    db.add(stock)
    db.commit()
    db.refresh(stock)
    return stock


@router.get("", response_model=list[StockRead])
def list_stocks(db: Session = Depends(get_db)):
    stocks = db.query(Stock).order_by(Stock.ticker).all()
    # Auto-clean legacy names with share-class suffixes
    dirty = False
    for s in stocks:
        cleaned = _clean_name(s.name)
        if cleaned != s.name:
            s.name = cleaned
            dirty = True
    if dirty:
        db.commit()
    return stocks


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
