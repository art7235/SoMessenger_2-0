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
    duration = Column(Integer, nullable=True)  # seconds for voice/audio/video messages
    reply_to_id = Column(Integer, ForeignKey("messages.id"), nullable=True)
    # For the common channel discussion chat: root messages that mirror channel posts
    # have channel_post_id set. User comments are normal messages replying to those roots.
    channel_post_id = Column(Integer, ForeignKey("channel_posts.id"), nullable=True)
    is_edited = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    edited_at = Column(DateTime, nullable=True)
    sender = relationship("User", back_populates="sent_messages", foreign_keys=[sender_id])
    chat = relationship("Chat", back_populates="messages")
    reply_to = relationship("Message", remote_side=[id])
    reactions = relationship("Reaction", back_populates="message")
