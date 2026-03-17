"""
app/models/request.py
Maps to the existing base_requests table.
"""
import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from app.database import Base


class RequestStatus(str, enum.Enum):
    open      = "open"
    closed    = "closed"
    pending   = "pending"
    resolved  = "resolved"


class Request(Base):
    __tablename__ = "base_requests"

    id                = Column(Integer, primary_key=True)
    requester_id      = Column(Integer, ForeignKey("base_apps.id"))
    attached_agent_id = Column(Integer, ForeignKey("base_apps.id"), nullable=True)
    issue_id          = Column(Integer, nullable=True)
    status            = Column(Enum(RequestStatus), default=RequestStatus.open)
    language          = Column(String(20), nullable=True)
    created_at        = Column(DateTime, default=datetime.utcnow)
    resolved_at       = Column(DateTime, nullable=True)

    # Relationships
    chats     = relationship("Chat",    foreign_keys="Chat.request_id", lazy="selectin")
    requester = relationship("User",    foreign_keys=[requester_id])
    agent     = relationship("User",    foreign_keys=[attached_agent_id])
