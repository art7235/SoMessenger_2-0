from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from app.models.chat import Chat, ChatMember
from app.models.channel import Channel, ChannelPost, ChannelSubscriber
from app.models.message import Message
from app.core.encryption import encrypt_text, decrypt_text
from app.websocket.manager import manager
from typing import List, Optional

class ChatService:
    @staticmethod
    async def get_or_create_private_chat(db, user1_id, user2_id):
        m1 = select(ChatMember.chat_id).where(ChatMember.user_id==user1_id)
        m2 = select(ChatMember.chat_id).where(ChatMember.user_id==user2_id)
        r = await db.execute(select(Chat).where(and_(Chat.is_group==False, Chat.id.in_(m1), Chat.id.in_(m2))))
        chat = r.scalar_one_or_none()
        if chat: return chat
        chat = Chat(is_group=False, created_by=user1_id)
        db.add(chat); await db.flush()
        db.add(ChatMember(chat_id=chat.id, user_id=user1_id))
        db.add(ChatMember(chat_id=chat.id, user_id=user2_id))
        await db.commit(); await db.refresh(chat)
        await manager.send_to_user(user2_id, {"type": "new_chat", "chat_id": chat.id})
        return chat

    @staticmethod
    async def create_group_chat(db, name, creator_id, member_ids):
        chat = Chat(name=name, is_group=True, created_by=creator_id)
        db.add(chat); await db.flush()
        db.add(ChatMember(chat_id=chat.id, user_id=creator_id, is_admin=True))
        for uid in member_ids:
            if uid != creator_id:
                db.add(ChatMember(chat_id=chat.id, user_id=uid))
        await db.commit(); await db.refresh(chat)
        for uid in member_ids:
            if uid != creator_id:
                await manager.send_to_user(uid, {"type": "new_chat", "chat_id": chat.id, "name": name})
        return chat

    @staticmethod
    async def ensure_chat_member(db, chat_id: int, user_id: int, is_admin: bool = False):
        r = await db.execute(select(ChatMember).where(and_(ChatMember.chat_id==chat_id, ChatMember.user_id==user_id)))
        member = r.scalar_one_or_none()
        if not member:
            db.add(ChatMember(chat_id=chat_id, user_id=user_id, is_admin=is_admin))
            await db.flush()
        elif is_admin and not member.is_admin:
            member.is_admin = True
            await db.flush()
        return member

    @staticmethod
    async def remove_chat_member(db, chat_id: int, user_id: int):
        r = await db.execute(select(ChatMember).where(and_(ChatMember.chat_id==chat_id, ChatMember.user_id==user_id)))
        member = r.scalar_one_or_none()
        if member:
            await db.delete(member)
            await db.flush()

    @staticmethod
    async def get_or_create_channel_chat(db, channel: Channel, user_id: Optional[int] = None):
        """One common discussion chat per channel (Telegram-like comments group)."""
        r = await db.execute(select(Chat).where(Chat.channel_id==channel.id))
        chat = r.scalar_one_or_none()
        if not chat:
            chat = Chat(
                name=f"💬 {channel.name}",
                is_group=True,
                channel_id=channel.id,
                created_by=channel.owner_id,
                avatar_url=channel.avatar_url,
                description=f"Общий чат канала {channel.name}",
            )
            db.add(chat); await db.flush()

        # The channel owner is always an admin in the discussion chat.
        await ChatService.ensure_chat_member(db, chat.id, channel.owner_id, is_admin=True)
        if user_id:
            await ChatService.ensure_chat_member(db, chat.id, user_id, is_admin=(user_id == channel.owner_id))
        await db.flush()
        return chat

    @staticmethod
    async def get_post_root_message(db, chat_id: int, post_id: int):
        r = await db.execute(select(Message).where(and_(Message.chat_id==chat_id, Message.channel_post_id==post_id, Message.is_deleted==False)))
        return r.scalar_one_or_none()

    @staticmethod
    async def ensure_post_root_message(db, channel: Channel, post: ChannelPost, user_id: Optional[int] = None):
        """Mirror a channel post into the one common channel chat.

        Comments are stored as normal messages that reply to this root message. This
        gives two display modes without creating a separate chat per post:
        - filtered mode: only messages replying to this root;
        - common chat mode: all roots and replies in one chronological chat.
        """
        chat = await ChatService.get_or_create_channel_chat(db, channel, user_id)
        root = await ChatService.get_post_root_message(db, chat.id, post.id)
        if not root:
            file_url = post.file_url or (decrypt_text(post.content) if post.message_type == "sticker" else None)
            root = Message(
                chat_id=chat.id,
                sender_id=post.author_id,
                content=encrypt_text(post.content),
                message_type=post.message_type or "text",
                file_url=file_url,
                channel_post_id=post.id,
                created_at=post.created_at,
            )
            db.add(root); await db.flush()
        else:
            # Keep the mirrored message in sync after media upload/edit-like updates.
            root.content = encrypt_text(post.content)
            root.message_type = post.message_type or "text"
            root.file_url = post.file_url or (decrypt_text(post.content) if post.message_type == "sticker" else None)
            await db.flush()
        return chat, root

    @staticmethod
    async def get_or_create_comments_chat(db, channel_id, post_id, channel_owner_id, user_id):
        """Compatibility wrapper: returns the common channel chat + the post root.

        v5 created one group per post via Chat.post_id. New versions never create a
        post-specific chat; they reuse Chat.channel_id and filter messages by root.
        """
        channel = (await db.execute(select(Channel).where(Channel.id==channel_id))).scalar_one_or_none()
        if not channel:
            return None, None
        post = (await db.execute(select(ChannelPost).where(and_(ChannelPost.id==post_id, ChannelPost.channel_id==channel_id)))).scalar_one_or_none()
        if not post:
            return None, None
        chat, root = await ChatService.ensure_post_root_message(db, channel, post, user_id)
        await db.commit(); await db.refresh(chat); await db.refresh(root)
        return chat, root

    @staticmethod
    async def add_channel_subscriber_to_discussion(db, channel_id: int, user_id: int):
        channel = (await db.execute(select(Channel).where(Channel.id==channel_id))).scalar_one_or_none()
        if not channel: return None
        chat = await ChatService.get_or_create_channel_chat(db, channel, user_id)
        await db.commit(); await db.refresh(chat)
        return chat

    @staticmethod
    async def get_user_chats(db, user_id):
        r = await db.execute(select(Chat).join(ChatMember, ChatMember.chat_id==Chat.id)
            .where(ChatMember.user_id==user_id)
            .options(selectinload(Chat.members).selectinload(ChatMember.user))
            .options(selectinload(Chat.messages)))
        return r.scalars().unique().all()

    @staticmethod
    async def is_chat_member(db, chat_id, user_id):
        r = await db.execute(select(ChatMember).where(and_(ChatMember.chat_id==chat_id, ChatMember.user_id==user_id)))
        return r.scalar_one_or_none() is not None

    @staticmethod
    async def get_chat_member_ids(db, chat_id):
        r = await db.execute(select(ChatMember.user_id).where(ChatMember.chat_id==chat_id))
        return [row[0] for row in r.all()]
