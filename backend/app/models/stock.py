from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship
from app.database import Base


class Stock(Base):
    __tablename__ = "stocks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(String(10), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    logo_url = Column(String(500), nullable=True)

    theses = relationship("Thesis", back_populates="stock", cascade="all, delete-orphan")
    evaluations = relationship("Evaluation", back_populates="stock", cascade="all, delete-orphan")
