from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, and_, func
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.models.user import User
from app.models.channel import Channel, ChannelPost, PostView, PostComment, ChannelSubscriber
from app.models.chat import Chat, ChatMember
from app.models.message import Message
from app.api.routes.users import get_current_user
from app.services.chat_service import ChatService
from app.services.message_service import MessageService
from app.core.config import settings
from app.core.encryption import encrypt_text, decrypt_text
from app.websocket.manager import manager
from pydantic import BaseModel
from typing import Optional
import aiofiles, os, uuid

router = APIRouter(prefix="/channels", tags=["channels"])

@router.post("/")
async def create_channel(data: dict, u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if data.get("username"):
        if (await db.execute(select(Channel).where(Channel.username==data["username"]))).scalar_one_or_none():
            raise HTTPException(400,"Username уже занят")
    ch = Channel(name=data["name"],description=data.get("description"),username=data.get("username"),
        is_public=data.get("is_public",True),owner_id=u.id)
    db.add(ch); await db.flush()
    # Create the common discussion chat immediately. It will be reused for all
    # comments/posts instead of creating one chat per post.
    await ChatService.get_or_create_channel_chat(db, ch, u.id)
    await db.commit(); await db.refresh(ch)
    return {"id":ch.id,"name":ch.name}

@router.get("/")
async def get_public_channels(u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Channel).where(Channel.is_public==True).limit(50))
    return [{"id":c.id,"name":c.name,"description":c.description,"username":c.username,
        "avatar_url":c.avatar_url,"subscribers_count":c.subscribers_count} for c in r.scalars().all()]

@router.get("/my")
async def get_my_channels(u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Channel).where(Channel.owner_id==u.id))
    return [{"id":c.id,"name":c.name,"description":c.description,"username":c.username,
        "avatar_url":c.avatar_url,"subscribers_count":c.subscribers_count} for c in r.scalars().all()]

@router.get("/joined")
async def get_joined_channels(u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Channel).join(ChannelSubscriber).where(ChannelSubscriber.user_id==u.id))
    return [{"id":c.id,"name":c.name,"description":c.description,"username":c.username,
        "avatar_url":c.avatar_url,"subscribers_count":c.subscribers_count} for c in r.scalars().all()]

@router.get("/search")
async def search_channels(q: str, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Channel).where(Channel.name.ilike(f"%{q}%")|Channel.username.ilike(f"%{q}%")).limit(20))
    return [{"id":c.id,"name":c.name,"username":c.username,"avatar_url":c.avatar_url,
        "subscribers_count":c.subscribers_count} for c in r.scalars().all()]

@router.get("/{channel_id}")
async def get_channel(channel_id: int, u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ch = (await db.execute(select(Channel).where(Channel.id==channel_id))).scalar_one_or_none()
    if not ch: raise HTTPException(404,"Канал не найден")
    return {"id":ch.id,"name":ch.name,"description":ch.description,"username":ch.username,
        "avatar_url":ch.avatar_url,"subscribers_count":ch.subscribers_count,"owner_id":ch.owner_id,
        "is_owner":ch.owner_id==u.id}

@router.post("/{channel_id}/subscribe")
async def subscribe(channel_id: int, u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if (await db.execute(select(ChannelSubscriber).where(and_(ChannelSubscriber.channel_id==channel_id, ChannelSubscriber.user_id==u.id)))).scalar_one_or_none():
        return {"message":"Уже подписан"}
    db.add(ChannelSubscriber(channel_id=channel_id, user_id=u.id))
    ch = (await db.execute(select(Channel).where(Channel.id==channel_id))).scalar_one_or_none()
    if ch:
        ch.subscribers_count+=1
        await ChatService.get_or_create_channel_chat(db, ch, u.id)
    await db.commit(); return {"status":"ok"}

@router.post("/{channel_id}/unsubscribe")
async def unsubscribe(channel_id: int, u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    sub = (await db.execute(select(ChannelSubscriber).where(and_(ChannelSubscriber.channel_id==channel_id, ChannelSubscriber.user_id==u.id)))).scalar_one_or_none()
    if sub:
        await db.delete(sub)
        ch = (await db.execute(select(Channel).where(Channel.id==channel_id))).scalar_one_or_none()
        if ch and ch.subscribers_count>0: ch.subscribers_count-=1
        chat = (await db.execute(select(Chat).where(Chat.channel_id==channel_id))).scalar_one_or_none()
        if chat and (not ch or ch.owner_id != u.id):
            await ChatService.remove_chat_member(db, chat.id, u.id)
        await db.commit()
    return {"status":"ok"}

@router.post("/{channel_id}/avatar")
async def upload_channel_avatar(channel_id: int, file: UploadFile=File(...),
        u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ch = (await db.execute(select(Channel).where(Channel.id==channel_id))).scalar_one_or_none()
    if not ch or ch.owner_id!=u.id: raise HTTPException(403,"Нет прав")
    ext = os.path.splitext(file.filename)[1] if file.filename else ".jpg"
    fn = f"channel_{channel_id}_{uuid.uuid4()}{ext}"
    fp = os.path.join(settings.UPLOAD_DIR,"avatars",fn)
    async with aiofiles.open(fp,"wb") as f: await f.write(await file.read())
    ch.avatar_url=f"/uploads/avatars/{fn}"; await db.commit()
    return {"avatar_url":ch.avatar_url}

@router.get("/{channel_id}/posts")
async def get_channel_posts(channel_id: int, limit: int=30, offset: int=0,
        u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ch = (await db.execute(select(Channel).where(Channel.id==channel_id))).scalar_one_or_none()
    if not ch: raise HTTPException(404,"Канал не найден")
    subscribed = (await db.execute(select(ChannelSubscriber).where(and_(
        ChannelSubscriber.channel_id==channel_id, ChannelSubscriber.user_id==u.id
    )))).scalar_one_or_none() is not None
    discussion_user_id = u.id if (ch.owner_id==u.id or subscribed) else None
    chat = await ChatService.get_or_create_channel_chat(db, ch, discussion_user_id)

    r = await db.execute(select(ChannelPost).where(ChannelPost.channel_id==channel_id)
        .options(selectinload(ChannelPost.reactions))
        .order_by(ChannelPost.created_at.desc()).limit(limit).offset(offset))
    # Load newest page from DB, but render chronologically: old messages at top,
    # new messages at bottom (Telegram/common chat behaviour).
    posts = list(reversed(r.scalars().all()))
    result=[]
    for p in posts:
        # Keep the common channel chat in sync with channel posts.
        await ChatService.ensure_post_root_message(db, ch, p, discussion_user_id)
        rg={}
        for rxn in (p.reactions or []): rg[rxn.emoji]=rg.get(rxn.emoji,0)+1
        comments_count = 0
        root = None
        if chat:
            root = (await db.execute(select(Message).where(and_(Message.chat_id==chat.id,
                Message.channel_post_id==p.id, Message.is_deleted==False)))).scalar_one_or_none()
            if root:
                comments_count = (await db.execute(select(func.count(Message.id)).where(and_(
                    Message.chat_id==chat.id, Message.reply_to_id==root.id, Message.is_deleted==False
                )))).scalar() or 0
        # Backward compatibility for the old PostComment table, if it was used before.
        if not comments_count:
            comments_count = (await db.execute(select(func.count(PostComment.id)).where(PostComment.post_id==p.id))).scalar() or 0
        result.append({"id":p.id,"channel_id":p.channel_id,"author_id":p.author_id,
            "content":decrypt_text(p.content),"file_url":p.file_url,"message_type":p.message_type,
            "views_count":p.views_count,"comments_count":comments_count,
            "reactions":rg,"created_at":p.created_at.isoformat()+"Z"})
    await db.commit()
    return result

@router.post("/{channel_id}/posts/{post_id}/view")
async def record_post_view(channel_id: int, post_id: int,
        u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(PostView).where(and_(PostView.post_id==post_id, PostView.user_id==u.id)))
    if existing.scalar_one_or_none(): return {"status":"already_viewed"}
    db.add(PostView(post_id=post_id, user_id=u.id))
    await db.execute(update(ChannelPost).where(ChannelPost.id==post_id).values(views_count=ChannelPost.views_count+1))
    await db.commit()
    return {"status":"ok"}

@router.post("/{channel_id}/posts")
async def create_post(channel_id: int, data: dict,
        u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ch = (await db.execute(select(Channel).where(Channel.id==channel_id))).scalar_one_or_none()
    if not ch: raise HTTPException(404,"Канал не найден")
    if ch.owner_id!=u.id: raise HTTPException(403,"Нет прав")
    message_type = data.get("message_type","text")
    raw_content = data.get("content")
    file_url = data.get("file_url") or (raw_content if message_type == "sticker" else None)
    post = ChannelPost(channel_id=channel_id, author_id=u.id, content=encrypt_text(raw_content),
        message_type=message_type, file_url=file_url)
    db.add(post); await db.flush()
    await ChatService.ensure_post_root_message(db, ch, post, u.id)
    await db.commit(); await db.refresh(post)
    return {"id":post.id,"content":decrypt_text(post.content),"file_url":post.file_url,
        "message_type":post.message_type,"created_at":post.created_at.isoformat()+"Z"}

@router.post("/{channel_id}/posts/{post_id}/upload")
async def upload_post_media(channel_id: int, post_id: int, file: UploadFile=File(...),
        u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ch = (await db.execute(select(Channel).where(Channel.id==channel_id))).scalar_one_or_none()
    if not ch or ch.owner_id!=u.id: raise HTTPException(403,"Нет прав")
    ct = file.content_type or ""
    if ct.startswith("image/"):
        folder, message_type = "media", "image"
    elif ct.startswith("video/"):
        folder, message_type = "media", "video"
    else:
        folder, message_type = "files", "file"
    ext = os.path.splitext(file.filename)[1] if file.filename else ""
    fn = f"{uuid.uuid4()}{ext}"
    fp = os.path.join(settings.UPLOAD_DIR, folder, fn)
    content = await file.read()
    if len(content) > settings.MAX_FILE_SIZE: raise HTTPException(413,"Файл слишком большой")
    os.makedirs(os.path.dirname(fp), exist_ok=True)
    async with aiofiles.open(fp,"wb") as f: await f.write(content)
    post = (await db.execute(select(ChannelPost).where(and_(ChannelPost.id==post_id, ChannelPost.channel_id==channel_id)))).scalar_one_or_none()
    if not post: raise HTTPException(404,"Пост не найден")
    file_url = f"/uploads/{folder}/{fn}"
    post.file_url=file_url
    post.message_type=message_type
    await ChatService.ensure_post_root_message(db, ch, post, u.id)
    await db.commit()
    return {"file_url":file_url,"message_type":message_type}

# Post reactions
@router.post("/{channel_id}/posts/{post_id}/react")
async def react_to_post(channel_id: int, post_id: int, data: dict,
        u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    post = (await db.execute(select(ChannelPost).where(and_(ChannelPost.id==post_id, ChannelPost.channel_id==channel_id)))).scalar_one_or_none()
    if not post: raise HTTPException(404,"Пост не найден")
    emoji = data.get("emoji")
    if not emoji: raise HTTPException(400,"Emoji обязателен")
    r = await MessageService.add_post_reaction(db, post_id, u.id, emoji)
    return {"status":"ok","added":r is not None}

# Comments chat
@router.get("/{channel_id}/posts/{post_id}/comments-chat")
async def get_comments_chat(channel_id: int, post_id: int,
        u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ch = (await db.execute(select(Channel).where(Channel.id==channel_id))).scalar_one_or_none()
    if not ch: raise HTTPException(404,"Канал не найден")
    chat, root = await ChatService.get_or_create_comments_chat(db, channel_id, post_id, ch.owner_id, u.id)
    if not chat or not root: raise HTTPException(404,"Пост не найден")
    post = (await db.execute(select(ChannelPost).where(ChannelPost.id==post_id))).scalar_one_or_none()
    return {"chat_id":chat.id,"root_message_id":root.id,
        "post_content":decrypt_text(post.content) if post else "","post_id":post_id,
        "channel_id":channel_id,"mode":"filtered_comments"}
