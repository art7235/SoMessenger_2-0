from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, UniqueConstraint
from datetime import datetime
from app.core.database import Base

class InviteLink(Base):
    __tablename__ = "invite_links"
    id = Column(Integer, primary_key=True, index=True)
    kind = Column(String(10), nullable=False)  # chat | channel
    target_id = Column(Integer, nullable=False)
    code = Column(String(32), unique=True, index=True, nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
    max_uses = Column(Integer, nullable=True)
    uses_count = Column(Integer, default=0)
    revoked = Column(Boolean, default=False)

class Ban(Base):
    __tablename__ = "bans"
    id = Column(Integer, primary_key=True, index=True)
    kind = Column(String(10), nullable=False)  # chat | channel
    target_id = Column(Integer, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    banned_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    reason = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("kind", "target_id", "user_id", name="uq_ban_target_user"),)

class AuditLogEntry(Base):
    __tablename__ = "audit_log_entries"
    id = Column(Integer, primary_key=True, index=True)
    kind = Column(String(10), nullable=False)  # chat | channel
    target_id = Column(Integer, nullable=False)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String(30), nullable=False)
    target_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    details = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
