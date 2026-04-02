from datetime import datetime
from sqlalchemy import Column, Integer, Date, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base


class Briefing(Base):
    __tablename__ = "briefings"
    __table_args__ = (
        UniqueConstraint("portfolio_id", "date", name="uq_portfolio_date_briefing"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"), nullable=True, index=True)
    date = Column(Date, nullable=False)
    summary = Column(Text, nullable=False)
    items = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    owner = relationship("User", back_populates="briefings")
    portfolio = relationship("Portfolio", back_populates="briefings")
