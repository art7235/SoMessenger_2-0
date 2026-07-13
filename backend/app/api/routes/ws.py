from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.websocket.manager import manager
from app.core.security import decode_token
from app.core.database import AsyncSessionLocal
from app.services.user_service import UserService
from app.services.chat_service import ChatService
import json

router = APIRouter()

@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, token: str = Query(...)):
    payload = decode_token(token)
    if not payload: await ws.close(code=4001); return
    user_id = int(payload["sub"])

    async with AsyncSessionLocal() as db:
        me = await UserService.get_user_by_id(db, user_id)
        display_name = me.display_name if me else "Пользователь"
        await UserService.update_online_status(db, user_id, True)
        # Get user's contacts
        chats = await ChatService.get_user_chats(db, user_id)
        contact_ids = set()
        chat_member_ids = {}
        for chat in chats:
            mids = await ChatService.get_chat_member_ids(db, chat.id)
            chat_member_ids[chat.id] = mids
            for mid in mids:
                if mid != user_id: contact_ids.add(mid)

    await manager.connect(ws, user_id)
    for cid in contact_ids:
        await manager.send_to_user(cid, {"type":"user_online","user_id":user_id,"is_online":True})

    try:
        while True:
            data = await ws.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type")=="ping":
                    await ws.send_text(json.dumps({"type":"pong"}))
                elif msg.get("type")=="typing":
                    cid = msg.get("chat_id")
                    targets = [m for m in chat_member_ids.get(cid, []) if m != user_id]
                    if targets:
                        await manager.broadcast_to_users(targets,
                            {"type":"typing","user_id":user_id,"chat_id":cid,"user_name":display_name})
            except: pass
    except WebSocketDisconnect:
        manager.disconnect(ws, user_id)
        async with AsyncSessionLocal() as db:
            await UserService.update_online_status(db, user_id, False)
        for cid in contact_ids:
            await manager.send_to_user(cid, {"type":"user_online","user_id":user_id,"is_online":False})
