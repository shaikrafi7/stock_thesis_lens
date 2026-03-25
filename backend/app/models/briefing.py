from datetime import datetime, date as date_type
from sqlalchemy import Column, Integer, Date, Text, DateTime
from app.database import Base


class Briefing(Base):
    __tablename__ = "briefings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Date, unique=True, nullable=False)
    summary = Column(Text, nullable=False)
    items = Column(Text, nullable=False)  # JSON: list of {ticker, headline, impact, suggestion?}
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
