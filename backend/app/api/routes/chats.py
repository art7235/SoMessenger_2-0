from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.core.database import get_db
from app.models.user import User
from app.models.chat import Chat
from app.models.message import Message
from app.models.channel import Channel, ChannelPost, ChannelSubscriber
from app.services.chat_service import ChatService
from app.services.message_service import MessageService
from app.api.routes.users import get_current_user
from app.websocket.manager import manager
from app.core.config import settings
from app.core.encryption import decrypt_text
from pydantic import BaseModel
from typing import Optional, List
import aiofiles, os, uuid

router = APIRouter(prefix="/chats", tags=["chats"])

def _fmt(msg):
    rg={}
    for r in (msg.reactions or []): rg[r.emoji]=rg.get(r.emoji,0)+1
    rd=None
    if msg.reply_to:
        rd={"id":msg.reply_to.id,"content":decrypt_text(msg.reply_to.content),
            "sender_id":msg.reply_to.sender_id,
            "sender_name":msg.reply_to.sender.display_name if msg.reply_to.sender else "Пользователь",
            "message_type":msg.reply_to.message_type,"file_url":msg.reply_to.file_url}
    return {"id":msg.id,"chat_id":msg.chat_id,"sender_id":msg.sender_id,
        "sender_name":msg.sender.display_name if msg.sender else "Unknown",
        "sender_avatar":msg.sender.avatar_url if msg.sender else None,
        "content":decrypt_text(msg.content),"message_type":msg.message_type,
        "file_url":msg.file_url,"file_name":msg.file_name,"file_size":msg.file_size,
        "duration":msg.duration,
        "channel_post_id":msg.channel_post_id,
        "reply_to":rd,"is_edited":msg.is_edited,"reactions":rg,
        "created_at":msg.created_at.isoformat()+"Z"}

@router.get("/")
async def get_my_chats(u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Make the common discussion chat discoverable for every owned/subscribed
    # channel, including channels created before this update.
    owned = (await db.execute(select(Channel).where(Channel.owner_id==u.id))).scalars().all()
    joined = (await db.execute(select(Channel).join(ChannelSubscriber).where(ChannelSubscriber.user_id==u.id))).scalars().all()
    seen_channels=set()
    for ch in [*owned,*joined]:
        if ch.id in seen_channels: continue
        seen_channels.add(ch.id)
        await ChatService.get_or_create_channel_chat(db, ch, u.id)
        # Scenario B: opening the common discussion chat directly must show all
        # channel posts as root messages, with comments as replies to them.
        posts = (await db.execute(select(ChannelPost).where(ChannelPost.channel_id==ch.id)
            .order_by(ChannelPost.created_at.asc()))).scalars().all()
        for p in posts:
            await ChatService.ensure_post_root_message(db, ch, p, u.id)
    if seen_channels:
        await db.commit()
    chats = await ChatService.get_user_chats(db, u.id)
    result=[]
    for chat in chats:
        # Hide legacy v5 per-post comments chats from the sidebar. New comments use
        # one common channel discussion chat (chat.channel_id) with filtered display.
        if chat.post_id and not chat.channel_id:
            continue
        cn,ca,ou = chat.name,chat.avatar_url,None
        is_discussion = bool(chat.channel_id)
        channel_id = chat.channel_id
        if is_discussion:
            ch = (await db.execute(select(Channel).where(Channel.id==chat.channel_id))).scalar_one_or_none()
            if ch:
                cn = f"💬 {ch.name}"
                ca = ch.avatar_url
                channel_id = ch.id
        elif not chat.is_group:
            for m in chat.members:
                if m.user_id != u.id: ou=m.user; cn=ou.display_name; ca=ou.avatar_url; break
        lm=None
        if chat.messages:
            vis = [m for m in chat.messages if not m.is_deleted]
            if vis:
                m2 = sorted(vis, key=lambda x: x.created_at)[-1]
                lm = {"content":decrypt_text(m2.content),"message_type":m2.message_type,"created_at":m2.created_at.isoformat()+"Z"}
        result.append({"id":chat.id,"name":cn,"avatar_url":ca,"is_group":chat.is_group,
            "is_comments":False,"is_discussion":is_discussion,"channel_id":channel_id,
            "post_id":chat.post_id,
            "last_message":lm,"other_user_id":ou.id if ou else None,
            "other_user_online":ou.is_online if ou else None,"created_at":chat.created_at.isoformat()+"Z"})
    return result

@router.get("/{chat_id}/messages")
async def get_messages(chat_id: int, limit: int=50, offset: int=0, comment_post_id: Optional[int]=None,
        u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not await ChatService.is_chat_member(db, chat_id, u.id): raise HTTPException(403,"Нет доступа")
    reply_to_id = None
    if comment_post_id is not None:
        root = (await db.execute(select(Message).where(and_(Message.chat_id==chat_id,
            Message.channel_post_id==comment_post_id, Message.is_deleted==False)))).scalar_one_or_none()
        if not root:
            return []
        reply_to_id = root.id
    msgs = await MessageService.get_chat_messages(db, chat_id, limit, offset, reply_to_id=reply_to_id)
    return [_fmt(m) for m in msgs]

@router.post("/{chat_id}/messages")
async def send_message(chat_id: int, data: dict,
        u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not await ChatService.is_chat_member(db, chat_id, u.id): raise HTTPException(403,"Нет доступа")
    fu = data.get("content") if data.get("message_type")=="sticker" else None
    msg = await MessageService.create_message(db, chat_id, u.id, content=data.get("content"),
        msg_type=data.get("message_type","text"), reply_to_id=data.get("reply_to_id"), file_url=fu)
    mids = await ChatService.get_chat_member_ids(db, chat_id)
    fm = _fmt(msg)
    await manager.broadcast_to_chat_members(mids, {"type":"new_message","chat_id":chat_id,"message":fm})
    return fm

@router.post("/{chat_id}/upload")
async def upload_file(chat_id: int, file: UploadFile=File(...), reply_to_id: Optional[int]=None, duration: Optional[float]=None,
        u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not await ChatService.is_chat_member(db, chat_id, u.id): raise HTTPException(403,"Нет доступа")
    ct = file.content_type or ""
    if ct.startswith("image/"): mt,fl = "image","media"
    elif ct.startswith("video/"): mt,fl = "video","media"
    elif ct.startswith("audio/"): mt,fl = "voice","voice"
    else: mt,fl = "file","files"
    ext = os.path.splitext(file.filename)[1] if file.filename else ""
    fn = f"{uuid.uuid4()}{ext}"
    fp = os.path.join(settings.UPLOAD_DIR, fl, fn)
    content = await file.read()
    if len(content) > settings.MAX_FILE_SIZE: raise HTTPException(413,"Файл слишком большой")
    os.makedirs(os.path.dirname(fp), exist_ok=True)
    async with aiofiles.open(fp,"wb") as f: await f.write(content)
    fu = f"/uploads/{fl}/{fn}"
    msg = await MessageService.create_message(db, chat_id, u.id, msg_type=mt, file_url=fu,
        file_name=file.filename, file_size=len(content), reply_to_id=reply_to_id,
        duration=duration if mt in ("voice","audio","video") else None)
    mids = await ChatService.get_chat_member_ids(db, chat_id)
    fm = _fmt(msg)
    await manager.broadcast_to_chat_members(mids, {"type":"new_message","chat_id":chat_id,"message":fm})
    return fm

@router.post("/{chat_id}/messages/{message_id}/react")
async def react_to_message(chat_id: int, message_id: int, data: dict,
        u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not await ChatService.is_chat_member(db, chat_id, u.id): raise HTTPException(403,"Нет доступа")
    r = await MessageService.add_reaction(db, message_id, u.id, data["emoji"])
    mids = await ChatService.get_chat_member_ids(db, chat_id)
    await manager.broadcast_to_chat_members(mids, {"type":"reaction","message_id":message_id,"chat_id":chat_id,
        "emoji":data["emoji"],"user_id":u.id,"added":r is not None})
    return {"status":"ok"}

@router.delete("/{chat_id}/messages/{message_id}")
async def delete_message(chat_id: int, message_id: int,
        u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ok = await MessageService.delete_message(db, message_id, u.id)
    if not ok: raise HTTPException(403,"Нельзя удалить")
    mids = await ChatService.get_chat_member_ids(db, chat_id)
    await manager.broadcast_to_chat_members(mids, {"type":"message_deleted","message_id":message_id,"chat_id":chat_id})
    return {"status":"deleted"}

@router.put("/{chat_id}/messages/{message_id}")
async def edit_message(chat_id: int, message_id: int, data: dict,
        u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    msg = await MessageService.edit_message(db, message_id, u.id, data.get("content"))
    if not msg: raise HTTPException(403,"Нельзя редактировать")
    mids = await ChatService.get_chat_member_ids(db, chat_id)
    await manager.broadcast_to_chat_members(mids, {"type":"message_edited","message_id":message_id,
        "chat_id":chat_id,"content":data.get("content")})
    return {"status":"edited"}

@router.post("/{chat_id}/avatar")
async def upload_chat_avatar(chat_id: int, file: UploadFile=File(...),
        u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not await ChatService.is_chat_member(db, chat_id, u.id): raise HTTPException(403,"Нет доступа")
    ext = os.path.splitext(file.filename)[1] if file.filename else ".jpg"
    fn = f"chat_{chat_id}_{uuid.uuid4()}{ext}"
    os.makedirs(os.path.join(settings.UPLOAD_DIR,"avatars"), exist_ok=True)
    async with aiofiles.open(os.path.join(settings.UPLOAD_DIR,"avatars",fn),"wb") as f: await f.write(await file.read())
    c = (await db.execute(select(Chat).where(Chat.id==chat_id))).scalar_one_or_none()
    if c: c.avatar_url=f"/uploads/avatars/{fn}"; await db.commit()
    return {"avatar_url":f"/uploads/avatars/{fn}"}

@router.post("/private")
async def create_private(data: dict, u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    chat = await ChatService.get_or_create_private_chat(db, u.id, data["user_id"])
    return {"chat_id":chat.id}

@router.post("/group")
async def create_group(data: dict, u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    chat = await ChatService.create_group_chat(db, data["name"], u.id, data["member_ids"])
    return {"chat_id":chat.id,"name":chat.name}

@router.post("/call/notify")
async def notify_call(data: dict, u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Уведомить пользователя о входящем звонке через основной WebSocket."""
    target_user_id = data.get("to_user_id")
    call_type = data.get("call_type", "audio")
    if not target_user_id:
        raise HTTPException(400, "to_user_id обязателен")
    await manager.send_to_user(target_user_id, {
        "type": "incoming_call",
        "from_user_id": u.id,
        "from_user_name": u.display_name,
        "call_type": call_type
    })
    return {"status": "ok"}

