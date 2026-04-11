from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.orm import relationship
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    screener_dismissed = Column(Text, nullable=True)  # JSON list of dismissed tickers

    portfolios = relationship("Portfolio", back_populates="owner", cascade="all, delete-orphan")
    stocks = relationship("Stock", back_populates="owner", cascade="all, delete-orphan")
    briefings = relationship("Briefing", back_populates="owner", cascade="all, delete-orphan")
    investor_profile = relationship("InvestorProfile", uselist=False, back_populates="user", cascade="all, delete-orphan")
