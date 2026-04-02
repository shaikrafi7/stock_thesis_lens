from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.portfolio import Portfolio
from app.models.stock import Stock
from app.models.user import User
from app.schemas.portfolio import PortfolioCreate, PortfolioUpdate, PortfolioRead
from app.core.auth import get_current_user

router = APIRouter(prefix="/portfolios", tags=["portfolios"])


def get_default_portfolio(user: User, db: Session) -> Portfolio:
    """Get or create the user's default portfolio."""
    p = db.query(Portfolio).filter(Portfolio.user_id == user.id, Portfolio.is_default == True).first()  # noqa: E712
    if not p:
        p = Portfolio(user_id=user.id, name="Default", is_default=True)
        db.add(p)
        db.commit()
        db.refresh(p)
    return p


def get_active_portfolio(portfolio_id: int | None, user: User, db: Session) -> Portfolio:
    """Resolve a portfolio_id to a Portfolio, falling back to the user's default."""
    if portfolio_id is None:
        return get_default_portfolio(user, db)
    p = db.query(Portfolio).filter(Portfolio.id == portfolio_id, Portfolio.user_id == user.id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return p


def _to_read(p: Portfolio, db: Session) -> PortfolioRead:
    count = db.query(Stock).filter(Stock.portfolio_id == p.id).count()
    return PortfolioRead(
        id=p.id,
        name=p.name,
        description=p.description,
        is_default=p.is_default,
        created_at=p.created_at,
        stock_count=count,
    )


@router.get("", response_model=list[PortfolioRead])
def list_portfolios(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    portfolios = db.query(Portfolio).filter(Portfolio.user_id == current_user.id).order_by(Portfolio.created_at).all()
    if not portfolios:
        default = get_default_portfolio(current_user, db)
        portfolios = [default]
    return [_to_read(p, db) for p in portfolios]


@router.post("", response_model=PortfolioRead, status_code=201)
def create_portfolio(payload: PortfolioCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = Portfolio(user_id=current_user.id, name=payload.name, description=payload.description, is_default=False)
    db.add(p)
    db.commit()
    db.refresh(p)
    return _to_read(p, db)


@router.patch("/{portfolio_id}", response_model=PortfolioRead)
def update_portfolio(portfolio_id: int, payload: PortfolioUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = db.query(Portfolio).filter(Portfolio.id == portfolio_id, Portfolio.user_id == current_user.id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    if payload.name is not None:
        p.name = payload.name
    if payload.description is not None:
        p.description = payload.description
    db.commit()
    db.refresh(p)
    return _to_read(p, db)


@router.delete("/{portfolio_id}", status_code=204)
def delete_portfolio(portfolio_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = db.query(Portfolio).filter(Portfolio.id == portfolio_id, Portfolio.user_id == current_user.id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    if p.is_default:
        raise HTTPException(status_code=400, detail="Cannot delete the default portfolio")
    db.delete(p)
    db.commit()
