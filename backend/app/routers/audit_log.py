"""Cross-stock post-mortem journal.

Returns closed theses with their lessons, ordered by most recent close.
Used by the Thesis Audit page so the user can review every post-mortem
written regardless of which stock it came from.
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.stock import Stock
from app.models.thesis import Thesis
from app.models.user import User
from app.core.auth import get_current_user
from app.schemas.thesis import ClosedThesisEntry


router = APIRouter(prefix="/audit-log", tags=["audit-log"])


@router.get("", response_model=list[ClosedThesisEntry])
def list_closed_theses(
    outcome: Optional[str] = Query(None, description="Filter by outcome bucket."),
    ticker: Optional[str] = Query(None, description="Filter by ticker."),
    portfolio_id: Optional[int] = Query(None),
    q: Optional[str] = Query(None, description="Search within lessons or statement text."),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ClosedThesisEntry]:
    """Return all closed theses owned by the user, most recent first."""
    query = (
        db.query(Thesis, Stock)
        .join(Stock, Thesis.stock_id == Stock.id)
        .filter(
            Stock.user_id == current_user.id,
            Thesis.closed_at.isnot(None),
        )
    )
    if portfolio_id is not None:
        query = query.filter(Stock.portfolio_id == portfolio_id)
    if outcome:
        query = query.filter(Thesis.outcome == outcome)
    if ticker:
        query = query.filter(Stock.ticker == ticker.upper())
    if q:
        needle = f"%{q.lower()}%"
        query = query.filter(
            (Thesis.lessons.ilike(needle)) | (Thesis.statement.ilike(needle))
        )

    rows = query.order_by(Thesis.closed_at.desc()).limit(limit).all()

    entries: list[ClosedThesisEntry] = []
    for thesis, stock in rows:
        duration = (thesis.closed_at - thesis.created_at).days if thesis.closed_at and thesis.created_at else 0
        entries.append(ClosedThesisEntry(
            thesis_id=thesis.id,
            ticker=stock.ticker,
            stock_name=getattr(stock, "name", None),
            category=thesis.category,
            statement=thesis.statement,
            outcome=thesis.outcome or "",
            lessons=thesis.lessons,
            closed_at=thesis.closed_at,
            created_at=thesis.created_at,
            duration_days=max(0, duration),
            importance=thesis.importance,
            frozen=bool(thesis.frozen),
            conviction=thesis.conviction,
        ))
    return entries
