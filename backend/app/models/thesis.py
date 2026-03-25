from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Thesis(Base):
    __tablename__ = "theses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    stock_id = Column(Integer, ForeignKey("stocks.id"), nullable=False)
    category = Column(String(50), nullable=False)  # competitive_moat | growth_trajectory | valuation | financial_health | ownership_conviction | risks
    statement = Column(Text, nullable=False)
    selected = Column(Boolean, default=True, nullable=False)
    weight = Column(Float, default=1.0, nullable=False)
    importance = Column(String(20), default="standard", nullable=False)  # standard | important | critical
    frozen = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_confirmed = Column(DateTime, nullable=True)

    stock = relationship("Stock", back_populates="theses")
