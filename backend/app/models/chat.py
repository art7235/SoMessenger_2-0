from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class Chat(Base):
    __tablename__ = "chats"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=True)
    is_group = Column(Boolean, default=False)
    avatar_url = Column(String(500), nullable=True)
    description = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    # LEGACY: in v5 this field was used to create a separate comments chat per post.
    # It is kept only for compatibility with existing databases; new channel discussions
    # use channel_id instead (one common chat per channel).
    post_id = Column(Integer, ForeignKey("channel_posts.id"), nullable=True, unique=True)
    channel_id = Column(Integer, ForeignKey("channels.id"), nullable=True, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    members = relationship("ChatMember", back_populates="chat")
    messages = relationship("Message", back_populates="chat")

class ChatMember(Base):
    __tablename__ = "chat_members"
    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(Integer, ForeignKey("chats.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_admin = Column(Boolean, default=False)
    joined_at = Column(DateTime, default=datetime.utcnow)
    last_read_message_id = Column(Integer, nullable=True)
    chat = relationship("Chat", back_populates="members")
    user = relationship("User", back_populates="chat_memberships")
