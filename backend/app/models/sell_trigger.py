"""Pre-commitment sell triggers — machine-checkable rules tied to a thesis point.

A user sets a rule like "if pe_ratio > 40, flag this thesis." On each evaluation
we check all active triggers against the latest market data; when the comparison
is true, status flips to 'triggered' and an audit row is logged.
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text

from app.database import Base


class SellTrigger(Base):
    __tablename__ = "sell_triggers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    thesis_id = Column(Integer, ForeignKey("theses.id"), nullable=False, index=True)
    stock_id = Column(Integer, ForeignKey("stocks.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    metric = Column(String(40), nullable=False)     # e.g. "price", "pe_ratio", "change_pct"
    operator = Column(String(4), nullable=False)    # "<", ">", "<=", ">="
    threshold = Column(Float, nullable=False)

    status = Column(String(12), nullable=False, default="watching")  # watching | triggered | dismissed
    note = Column(Text, nullable=True)
    triggered_at = Column(DateTime, nullable=True)
    triggered_value = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
