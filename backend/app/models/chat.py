from sqlalchemy import Column, Integer, String, Text, DateTime, func
from app.database import Base


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    context_key = Column(String(50), nullable=False, index=True)  # ticker or "__portfolio__"
    role = Column(String(10), nullable=False)  # "user" | "assistant"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=func.now())
