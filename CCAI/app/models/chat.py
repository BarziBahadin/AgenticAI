"""
app/models/chat.py
Maps to the existing base_chats table.
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from app.database import Base


class Chat(Base):
    __tablename__ = "base_chats"

    id           = Column(Integer, primary_key=True)
    request_id   = Column(Integer, ForeignKey("base_requests.id"))
    message      = Column(Text)
    type         = Column(String(100))          # sender role: customer/agent/technical-support/noc
    account_type = Column(String(100))          # tier indicator
    sent_at      = Column(DateTime, default=datetime.utcnow)
