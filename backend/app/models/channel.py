from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class Channel(Base):
    __tablename__ = "channels"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    username = Column(String(50), unique=True, nullable=True)
    avatar_url = Column(String(500), nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_public = Column(Boolean, default=True)
    subscribers_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    posts = relationship("ChannelPost", back_populates="channel")
    subscribers = relationship("ChannelSubscriber", back_populates="channel")

class ChannelSubscriber(Base):
    __tablename__ = "channel_subscribers"
    id = Column(Integer, primary_key=True, index=True)
    channel_id = Column(Integer, ForeignKey("channels.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    channel = relationship("Channel", back_populates="subscribers")
    user = relationship("User")

class ChannelPost(Base):
    __tablename__ = "channel_posts"
    id = Column(Integer, primary_key=True, index=True)
    channel_id = Column(Integer, ForeignKey("channels.id"), nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=True)
    file_url = Column(String(500), nullable=True)
    message_type = Column(String(20), default="text")
    views_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    channel = relationship("Channel", back_populates="posts")
    comments = relationship("PostComment", back_populates="post")
    reactions = relationship("Reaction", back_populates="channel_post")
    post_views = relationship("PostView", back_populates="post")

class PostView(Base):
    __tablename__ = "post_views"
    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("channel_posts.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("post_id","user_id",name="uq_post_user"),)
    post = relationship("ChannelPost", back_populates="post_views")

class PostComment(Base):
    __tablename__ = "post_comments"
    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("channel_posts.id"), nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    post = relationship("ChannelPost", back_populates="comments")
