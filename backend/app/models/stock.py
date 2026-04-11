from sqlalchemy import Column, Integer, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base


class Stock(Base):
    __tablename__ = "stocks"
    __table_args__ = (
        UniqueConstraint("portfolio_id", "ticker", name="uq_portfolio_ticker"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"), nullable=True, index=True)
    ticker = Column(String(10), nullable=False)
    name = Column(String(255), nullable=False)
    logo_url = Column(String(500), nullable=True)
    watchlist = Column(String(5), default="false", nullable=False)  # "true" | "false" stored as string for SQLite compat

    owner = relationship("User", back_populates="stocks")
    portfolio = relationship("Portfolio", back_populates="stocks")
    theses = relationship("Thesis", back_populates="stock", cascade="all, delete-orphan")
    evaluations = relationship("Evaluation", back_populates="stock", cascade="all, delete-orphan")
