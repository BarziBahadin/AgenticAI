"""
app/models/qa_score.py
Maps to qiyas_qa_scores (created by migration_v1.sql).
"""
from datetime import datetime
from sqlalchemy import Column, Integer, Float, Text, String, DateTime, Boolean, ForeignKey
from app.database import Base


class QAScore(Base):
    __tablename__ = "qiyas_qa_scores"

    id                   = Column(Integer, primary_key=True, autoincrement=True)
    request_id           = Column(Integer, ForeignKey("base_requests.id"), unique=True, nullable=False)

    # Dimension scores
    score_greeting       = Column(Float, default=0)
    score_discovery      = Column(Float, default=0)
    score_verification   = Column(Float, default=0)
    score_resolution     = Column(Float, default=0)
    score_next_steps     = Column(Float, default=0)
    score_efficiency     = Column(Float, default=0)
    score_escalation     = Column(Float, default=0)
    score_compliance     = Column(Float, default=0)

    total_score          = Column(Float, nullable=False)

    # AI analysis
    summary_ar           = Column(Text)
    summary_en           = Column(Text)
    action_required      = Column(Text)
    raw_llm_response     = Column(Text)

    # Flags
    is_flagged           = Column(Boolean, default=False)
    is_repeat_contact    = Column(Boolean, default=False)
    repeat_contact_count = Column(Integer, default=1)

    # Dispute
    is_disputed          = Column(Boolean, default=False)
    dispute_reason       = Column(Text)
    dispute_by_user_id   = Column(Integer, nullable=True)
    dispute_at           = Column(DateTime, nullable=True)

    # Metadata
    scored_at            = Column(DateTime, default=datetime.utcnow)
    model_used           = Column(String(100))
    scoring_version      = Column(String(20), default="1.0")
