from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.models.message import Message
from app.models.reaction import Reaction
from app.core.encryption import encrypt_text
from typing import Optional, List

class MessageService:
    @staticmethod
    async def create_message(db, chat_id, sender_id, content=None, msg_type="text",
            file_url=None, file_name=None, file_size=None, reply_to_id=None, duration=None):
        msg = Message(chat_id=chat_id, sender_id=sender_id, content=encrypt_text(content), message_type=msg_type,
            file_url=file_url, file_name=file_name, file_size=file_size, reply_to_id=reply_to_id,
            duration=int(duration) if duration is not None else None)
        db.add(msg); await db.commit(); await db.refresh(msg)
        r = await db.execute(select(Message).where(Message.id==msg.id)
            .options(selectinload(Message.sender)).options(selectinload(Message.reactions))
            .options(selectinload(Message.reply_to).selectinload(Message.sender)))
        return r.scalar_one()
    @staticmethod
    async def get_chat_messages(db, chat_id, limit=50, offset=0, reply_to_id=None):
        filters = [Message.chat_id==chat_id, Message.is_deleted==False]
        if reply_to_id is not None:
            filters.append(Message.reply_to_id==reply_to_id)
        r = await db.execute(select(Message).where(*filters)
            .options(selectinload(Message.sender)).options(selectinload(Message.reactions))
            .options(selectinload(Message.reply_to).selectinload(Message.sender))
            .order_by(Message.created_at.desc()).limit(limit).offset(offset))
        # DB returns newest-first for correct pagination; UI renders oldest -> newest.
        return list(reversed(r.scalars().all()))
    @staticmethod
    async def add_reaction(db, message_id, user_id, emoji):
        existing = await db.execute(select(Reaction).where(Reaction.message_id==message_id, Reaction.user_id==user_id, Reaction.emoji==emoji))
        r = existing.scalar_one_or_none()
        if r: await db.delete(r); await db.commit(); return None
        old = (await db.execute(select(Reaction).where(Reaction.message_id==message_id, Reaction.user_id==user_id))).scalar_one_or_none()
        if old: await db.delete(old)
        r = Reaction(message_id=message_id, user_id=user_id, emoji=emoji)
        db.add(r); await db.commit(); await db.refresh(r); return r
    @staticmethod
    async def add_post_reaction(db, post_id, user_id, emoji):
        existing = await db.execute(select(Reaction).where(Reaction.channel_post_id==post_id, Reaction.user_id==user_id, Reaction.emoji==emoji))
        r = existing.scalar_one_or_none()
        if r: await db.delete(r); await db.commit(); return None
        old = (await db.execute(select(Reaction).where(Reaction.channel_post_id==post_id, Reaction.user_id==user_id))).scalar_one_or_none()
        if old: await db.delete(old)
        r = Reaction(channel_post_id=post_id, user_id=user_id, emoji=emoji)
        db.add(r); await db.commit(); await db.refresh(r); return r
    @staticmethod
    async def delete_message(db, message_id, user_id):
        msg = (await db.execute(select(Message).where(Message.id==message_id))).scalar_one_or_none()
        if msg and msg.sender_id==user_id: msg.is_deleted=True; await db.commit(); return True
        return False
    @staticmethod
    async def edit_message(db, message_id, user_id, new_content):
        from datetime import datetime
        msg = (await db.execute(select(Message).where(Message.id==message_id))).scalar_one_or_none()
        if msg and msg.sender_id==user_id:
            msg.content=encrypt_text(new_content); msg.is_edited=True; msg.edited_at=datetime.utcnow()
            await db.commit(); await db.refresh(msg); return msg
        return None
