"""
app/models/user.py
Maps to the existing base_apps table (users/agents).
"""
from sqlalchemy import Column, Integer, String
from app.database import Base


class User(Base):
    __tablename__ = "base_apps"

    id = Column(Integer, primary_key=True)
    name = Column(String(30))
