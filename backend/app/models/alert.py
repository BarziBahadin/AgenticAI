"""
app/models/alert.py
Maps to qiyas_alerts (created by migration_v1.sql).
"""
import enum
from datetime import datetime
from sqlalchemy import Column, Integer, Float, Text, DateTime, Boolean, ForeignKey, Enum
from app.database import Base


class AlertType(str, enum.Enum):
    low_score       = "low_score"
    repeat_contact  = "repeat_contact"
    app_downtime    = "app_downtime"


class AlertStatus(str, enum.Enum):
    open      = "open"
    reviewed  = "reviewed"
    dismissed = "dismissed"


class Alert(Base):
    __tablename__ = "qiyas_alerts"

    id                   = Column(Integer, primary_key=True, autoincrement=True)
    qa_score_id          = Column(Integer, ForeignKey("qiyas_qa_scores.id", ondelete="SET NULL"), nullable=True)
    request_id           = Column(Integer, ForeignKey("base_requests.id",  ondelete="SET NULL"), nullable=True)
    alert_type           = Column(Enum(AlertType), nullable=False)
    status               = Column(Enum(AlertStatus), default=AlertStatus.open, nullable=False)
    message              = Column(Text)
    score                = Column(Float, nullable=True)
    notify_supervisor_id = Column(Integer, nullable=True)
    notify_manager_id    = Column(Integer, nullable=True)
    email_sent           = Column(Boolean, default=False)
    email_sent_at        = Column(DateTime, nullable=True)
    created_at           = Column(DateTime, default=datetime.utcnow)
    reviewed_at          = Column(DateTime, nullable=True)
    reviewed_by_id       = Column(Integer, nullable=True)
