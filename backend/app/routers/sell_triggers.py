"""Pre-commitment sell-trigger routes.

Triggers attach to a thesis point. On each evaluation the trigger is compared
against the latest market snapshot / fundamentals; when the operator comparison
is true the trigger status flips to 'triggered' and an audit row is written.
"""
import logging
from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.auth import get_current_user
from app.models.user import User
from app.models.thesis import Thesis
from app.models.stock import Stock
from app.models.sell_trigger import SellTrigger

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/triggers", tags=["sell_triggers"])

ALLOWED_METRICS = ("price", "change_pct", "pe_ratio", "score")
ALLOWED_OPERATORS = ("<", ">", "<=", ">=")


class SellTriggerCreate(BaseModel):
    thesis_id: int
    metric: str
    operator: str
    threshold: float
    note: Optional[str] = None


class SellTriggerUpdate(BaseModel):
    status: Optional[Literal["watching", "triggered", "dismissed"]] = None
    threshold: Optional[float] = None
    note: Optional[str] = None


class SellTriggerRead(BaseModel):
    id: int
    thesis_id: int
    stock_id: int
    metric: str
    operator: str
    threshold: float
    status: str
    note: Optional[str] = None
    triggered_at: Optional[datetime] = None
    triggered_value: Optional[float] = None
    created_at: datetime

    model_config = {"from_attributes": True}


def _validate_metric(metric: str) -> None:
    if metric not in ALLOWED_METRICS:
        raise HTTPException(400, f"metric must be one of {ALLOWED_METRICS}")


def _validate_operator(op: str) -> None:
    if op not in ALLOWED_OPERATORS:
        raise HTTPException(400, f"operator must be one of {ALLOWED_OPERATORS}")


def _get_user_thesis(thesis_id: int, user: User, db: Session) -> Thesis:
    thesis = (
        db.query(Thesis)
        .join(Stock, Stock.id == Thesis.stock_id)
        .filter(Thesis.id == thesis_id, Stock.user_id == user.id)
        .first()
    )
    if not thesis:
        raise HTTPException(404, "Thesis not found")
    return thesis


@router.post("", response_model=SellTriggerRead)
def create_trigger(
    payload: SellTriggerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _validate_metric(payload.metric)
    _validate_operator(payload.operator)
    thesis = _get_user_thesis(payload.thesis_id, current_user, db)

    trig = SellTrigger(
        thesis_id=thesis.id,
        stock_id=thesis.stock_id,
        user_id=current_user.id,
        metric=payload.metric,
        operator=payload.operator,
        threshold=float(payload.threshold),
        status="watching",
        note=(payload.note or None),
    )
    db.add(trig)
    db.commit()
    db.refresh(trig)
    return trig


@router.get("", response_model=list[SellTriggerRead])
def list_triggers_for_thesis(
    thesis_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_user_thesis(thesis_id, current_user, db)
    rows = (
        db.query(SellTrigger)
        .filter(SellTrigger.thesis_id == thesis_id, SellTrigger.user_id == current_user.id)
        .order_by(SellTrigger.created_at.desc())
        .all()
    )
    return rows


@router.patch("/{trigger_id}", response_model=SellTriggerRead)
def update_trigger(
    trigger_id: int,
    payload: SellTriggerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    trig = (
        db.query(SellTrigger)
        .filter(SellTrigger.id == trigger_id, SellTrigger.user_id == current_user.id)
        .first()
    )
    if not trig:
        raise HTTPException(404, "Trigger not found")
    if payload.status is not None:
        trig.status = payload.status
        if payload.status == "dismissed":
            trig.triggered_at = None
            trig.triggered_value = None
    if payload.threshold is not None:
        trig.threshold = float(payload.threshold)
    if payload.note is not None:
        trig.note = payload.note or None
    db.commit()
    db.refresh(trig)
    return trig


@router.delete("/{trigger_id}")
def delete_trigger(
    trigger_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    trig = (
        db.query(SellTrigger)
        .filter(SellTrigger.id == trigger_id, SellTrigger.user_id == current_user.id)
        .first()
    )
    if not trig:
        raise HTTPException(404, "Trigger not found")
    db.delete(trig)
    db.commit()
    return {"ok": True}
