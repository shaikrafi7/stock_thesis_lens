import re
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.stock import Stock
from app.models.user import User
from app.schemas.stock import StockCreate, StockRead
from app.core.config import settings
from app.core.auth import get_current_user
from app.routers.portfolios import get_active_portfolio

router = APIRouter(prefix="/stocks", tags=["stocks"])

_TICKER_RE = re.compile(r'^[A-Z][A-Z0-9\.\-]{0,9}$')

_NAME_SUFFIX_RE = re.compile(
    r"\s*[-\u2013\u2014]?\s*(Class\s+[A-Z]\s+)?(Common\s+Stock|Ordinary\s+Shares?|American\s+Depositary\s+Shares?|ADR).*$",
    re.IGNORECASE,
)

def _clean_name(raw: str) -> str:
    cleaned = _NAME_SUFFIX_RE.sub("", raw).strip().rstrip(",").strip()
    return cleaned or raw


def _validate_and_get_metadata(ticker: str) -> tuple[str, str | None]:
    if not _TICKER_RE.match(ticker):
        raise HTTPException(
            status_code=422,
            detail=(
                f"'{ticker}' is not a valid ticker symbol. "
                "Enter a stock ticker like AAPL, NVDA, or BRK.B -- not a company name."
            ),
        )

    if not settings.POLYGON_API_KEY:
        return ticker, None

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

    return ticker, None


def get_user_stock(ticker: str, user: User, db: Session, portfolio_id: int | None = None) -> Stock:
    """Fetch a stock scoped to the current user's portfolio, or 404."""
    portfolio = get_active_portfolio(portfolio_id, user, db)
    stock = db.query(Stock).filter(Stock.ticker == ticker.upper(), Stock.portfolio_id == portfolio.id).first()
    if not stock:
        raise HTTPException(status_code=404, detail=f"Stock '{ticker.upper()}' not found")
    return stock


@router.post("", response_model=StockRead, status_code=201)
def create_stock(
    payload: StockCreate,
    portfolio_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    portfolio = get_active_portfolio(portfolio_id, current_user, db)

    existing = db.query(Stock).filter(
        Stock.ticker == payload.ticker, Stock.portfolio_id == portfolio.id
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Stock '{payload.ticker}' already exists")

    if payload.name:
        name, logo_url = payload.name, None
    else:
        name, logo_url = _validate_and_get_metadata(payload.ticker)

    stock = Stock(
        ticker=payload.ticker, name=name, logo_url=logo_url,
        user_id=current_user.id, portfolio_id=portfolio.id,
    )
    db.add(stock)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=f"Stock '{payload.ticker}' already exists")
    db.refresh(stock)
    return stock


@router.get("", response_model=list[StockRead])
def list_stocks(
    portfolio_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    portfolio = get_active_portfolio(portfolio_id, current_user, db)
    stocks = db.query(Stock).filter(Stock.portfolio_id == portfolio.id).order_by(Stock.ticker).all()
    dirty = False
    for s in stocks:
        cleaned = _clean_name(s.name)
        if cleaned != s.name:
            s.name = cleaned
            dirty = True
    if dirty:
        db.commit()
    return stocks


@router.get("/search", response_model=list[dict])
def search_tickers(q: str = Query(..., min_length=1), _current_user: User = Depends(get_current_user)):
    """Search for ticker symbols by keyword. Returns up to 8 results."""
    try:
        import yfinance as yf
        results = yf.Search(q, max_results=8)
        quotes = results.quotes
        out = []
        for item in quotes[:8]:
            ticker = item.get("symbol", "")
            name = item.get("longname") or item.get("shortname") or ""
            q_type = item.get("quoteType", "")
            if ticker and q_type in ("EQUITY", "ETF"):
                out.append({"ticker": ticker, "name": _clean_name(name)})
        return out
    except Exception:
        return []


@router.get("/{ticker}", response_model=StockRead)
def get_stock(
    ticker: str,
    portfolio_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_user_stock(ticker, current_user, db, portfolio_id)


@router.patch("/{ticker}/watchlist", response_model=StockRead)
def toggle_watchlist(
    ticker: str,
    portfolio_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stock = get_user_stock(ticker, current_user, db, portfolio_id)
    stock.watchlist = "false" if stock.watchlist == "true" else "true"
    db.commit()
    db.refresh(stock)
    return stock


@router.get("/{ticker}/share-token")
def get_share_token(
    ticker: str,
    portfolio_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.routers.share import get_or_create_token
    stock = get_user_stock(ticker, current_user, db, portfolio_id)
    token = get_or_create_token(stock.id, db)
    return {"token": token}


@router.delete("/{ticker}", status_code=204)
def delete_stock(
    ticker: str,
    portfolio_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stock = get_user_stock(ticker, current_user, db, portfolio_id)
    db.delete(stock)
    db.commit()
