from sqlalchemy import Column, Integer, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base


class Stock(Base):
    __tablename__ = "stocks"
    __table_args__ = (
        UniqueConstraint("user_id", "ticker", name="uq_user_ticker"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    ticker = Column(String(10), nullable=False)
    name = Column(String(255), nullable=False)
    logo_url = Column(String(500), nullable=True)

    owner = relationship("User", back_populates="stocks")
    theses = relationship("Thesis", back_populates="stock", cascade="all, delete-orphan")
    evaluations = relationship("Evaluation", back_populates="stock", cascade="all, delete-orphan")
