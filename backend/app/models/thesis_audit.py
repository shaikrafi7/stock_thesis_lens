from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from app.database import Base


class ThesisAudit(Base):
    __tablename__ = "thesis_audits"

    id = Column(Integer, primary_key=True, autoincrement=True)
    thesis_id = Column(Integer, nullable=True)  # nullable: thesis may be deleted
    stock_id = Column(Integer, ForeignKey("stocks.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String(20), nullable=False)  # created | updated | deleted | frozen | unfrozen | liked | disliked | conviction_cleared
    field_changed = Column(String(50), nullable=True)  # statement | selected | importance | conviction | frozen
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    statement_snapshot = Column(Text, nullable=False)  # thesis text at time of change
    category = Column(String(50), nullable=False)
    note = Column(Text, nullable=True)  # user-supplied reasoning
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
