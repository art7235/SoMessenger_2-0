from sqlalchemy import Column, Integer, ForeignKey, DateTime, UniqueConstraint
from datetime import datetime
from app.core.database import Base

class MessageDeletion(Base):
    """Per-user 'delete for me' marker. Does not affect other participants."""
    __tablename__ = "message_deletions"
    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("messages.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("message_id", "user_id", name="uq_message_deletion_user"),)
