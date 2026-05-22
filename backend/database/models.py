from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from .config import Base

class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(String, primary_key=True, index=True) # e.g., demo_meeting_001
    created_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="active") 
    transcripts = relationship("Transcript", back_populates="meeting")
    summary = relationship("Summary", back_populates="meeting", uselist=False)

class Transcript(Base):
    __tablename__ = "transcripts"

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(String, ForeignKey("meetings.id"))
    user_name = Column(String)
    text = Column(Text)
    timestamp = Column(DateTime, default=datetime.utcnow)

    # Relationship
    meeting = relationship("Meeting", back_populates="transcripts")

class Summary(Base):
    __tablename__ = "summaries"

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(String, ForeignKey("meetings.id"), unique=True)
    summary_text = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationship
    meeting = relationship("Meeting", back_populates="summary")