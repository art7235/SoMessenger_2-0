from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base
import enum

class MessageType(str, enum.Enum):
    text = "text"; image = "image"; video = "video"; audio = "audio"
    voice = "voice"; file = "file"; sticker = "sticker"; video_message = "video_message"

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(Integer, ForeignKey("chats.id"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=True)
    message_type = Column(String(20), default="text")
    file_url = Column(String(500), nullable=True)
    file_name = Column(String(255), nullable=True)
    file_size = Column(Integer, nullable=True)
    duration = Column(Integer, nullable=True)
    reply_to_id = Column(Integer, ForeignKey("messages.id"), nullable=True)
    forward_from_id = Column(Integer, ForeignKey("messages.id"), nullable=True)
    channel_post_id = Column(Integer, ForeignKey("channel_posts.id"), nullable=True)
    is_edited = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    edited_at = Column(DateTime, nullable=True)

    # No back_populates here: this keeps the model compatible even if User.sent_messages
    # is absent in a local copy. Explicit foreign_keys are important because Message has
    # multiple links to users/messages and SQLAlchemy must not guess.
    sender = relationship("User", foreign_keys=[sender_id])
    chat = relationship("Chat", back_populates="messages")
    reply_to = relationship("Message", remote_side=[id], foreign_keys=[reply_to_id])
    forward_from = relationship("Message", remote_side=[id], foreign_keys=[forward_from_id])
    reactions = relationship("Reaction", back_populates="message")
