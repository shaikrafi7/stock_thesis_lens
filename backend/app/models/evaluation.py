from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Evaluation(Base):
    __tablename__ = "evaluations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    stock_id = Column(Integer, ForeignKey("stocks.id"), nullable=False)
    score = Column(Float, nullable=False)
    status = Column(String(10), nullable=False)  # green | yellow | red
    explanation = Column(Text, nullable=True)
    broken_points = Column(Text, nullable=True)    # JSON: list of {thesis_id, category, statement, signal, sentiment, deduction}
    confirmed_points = Column(Text, nullable=True)  # JSON: list of {thesis_id, category, statement, signal, sentiment, credit}
    frozen_breaks = Column(Text, nullable=True)      # JSON: list of frozen points that broke (subset of broken_points)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)

    stock = relationship("Stock", back_populates="evaluations")
