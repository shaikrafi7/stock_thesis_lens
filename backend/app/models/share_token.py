from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.database import Base


class ShareToken(Base):
    __tablename__ = "share_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token = Column(String(36), unique=True, nullable=False, index=True)
    stock_id = Column(Integer, ForeignKey("stocks.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
