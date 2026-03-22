from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Thesis(Base):
    __tablename__ = "theses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    stock_id = Column(Integer, ForeignKey("stocks.id"), nullable=False)
    category = Column(String(50), nullable=False)  # core_beliefs | strengths | risks | leadership | catalysts
    statement = Column(Text, nullable=False)
    selected = Column(Boolean, default=False, nullable=False)
    weight = Column(Float, default=1.0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_confirmed = Column(DateTime, nullable=True)

    stock = relationship("Stock", back_populates="theses")
