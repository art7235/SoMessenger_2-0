from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Float
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(Integer, ForeignKey("chats.id"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    content = Column(Text, nullable=True)  # Хранит зашифрованный текст или путь к файлу
    message_type = Column(String(50), default="text")  # text, image, video, voice, file, sticker
    
    file_url = Column(String(500), nullable=True)
    file_name = Column(String(255), nullable=True)
    file_size = Column(Integer, nullable=True)
    duration = Column(Float, nullable=True)  # Для аудио/видео
    
    # Поля для ответов и пересылки
    reply_to_id = Column(Integer, ForeignKey("messages.id"), nullable=True)
    forward_from_id = Column(Integer, ForeignKey("messages.id"), nullable=True)
    
    # Mirroring channel posts (for discussion chats)
    channel_post_id = Column(Integer, ForeignKey("channel_posts.id"), nullable=True)
    
    is_edited = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # СВЯЗИ (Исправлено: явно указаны foreign_keys для устранения двусмысленности)
    chat = relationship("Chat", back_populates="messages")
    sender = relationship("User", back_populates="messages")
    
    # Связь для ответов
    reply_to = relationship(
        "Message", 
        remote_side=[id], 
        foreign_keys=[reply_to_id],
        post_update=True
    )
    
    # Связь для пересылки
    forward_from = relationship(
        "Message", 
        remote_side=[id], 
        foreign_keys=[forward_from_id]
    )
    
    reactions = relationship("Reaction", back_populates="message", cascade="all, delete-orphan")