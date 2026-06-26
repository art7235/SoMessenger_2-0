from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class StickerPack(Base):
    __tablename__ = "sticker_packs"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    thumbnail_url = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    stickers = relationship("Sticker", back_populates="pack")

class Sticker(Base):
    __tablename__ = "stickers"
    id = Column(Integer, primary_key=True, index=True)
    pack_id = Column(Integer, ForeignKey("sticker_packs.id"), nullable=False)
    emoji = Column(String(10), nullable=True)
    file_url = Column(String(500), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    pack = relationship("StickerPack", back_populates="stickers")
