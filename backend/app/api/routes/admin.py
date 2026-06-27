from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime
from app.core.database import get_db
from app.core.config import settings
from app.models.user import User
from app.models.chat import Chat
from app.models.channel import Channel
from app.models.message import Message

router = APIRouter(tags=["admin"])


def verify_admin_token(token: str):
    """Check secret token. Returns 404 (not 403) if invalid — hides the panel existence."""
    if not settings.ADMIN_PANEL_TOKEN or token != settings.ADMIN_PANEL_TOKEN:
        raise HTTPException(status_code=404, detail="Not found")


@router.get("/admin/{token}/stats")
async def get_stats(token: str, db: AsyncSession = Depends(get_db)):
    verify_admin_token(token)

    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    online_users = (await db.execute(
        select(func.count(User.id)).where(User.is_online == True)
    )).scalar() or 0

    total_chats = (await db.execute(
        select(func.count(Chat.id)).where(Chat.is_group == False)
    )).scalar() or 0
    total_groups = (await db.execute(
        select(func.count(Chat.id)).where(Chat.is_group == True)
    )).scalar() or 0

    total_channels = (await db.execute(select(func.count(Channel.id)))).scalar() or 0
    total_messages = (await db.execute(select(func.count(Message.id)))).scalar() or 0

    today_messages = (await db.execute(
        select(func.count(Message.id)).where(Message.created_at >= today)
    )).scalar() or 0

    return {
        "total_users": total_users,
        "online_users": online_users,
        "total_chats": total_chats,
        "total_groups": total_groups,
        "total_channels": total_channels,
        "total_messages": total_messages,
        "today_messages": today_messages,
    }


@router.get("/admin/{token}/users")
async def get_recent_users(token: str, limit: int = 50, db: AsyncSession = Depends(get_db)):
    verify_admin_token(token)

    result = await db.execute(
        select(User.id, User.username, User.display_name, User.created_at, User.is_online)
        .order_by(User.created_at.desc())
        .limit(limit)
    )

    users = []
    for row in result.all():
        users.append({
            "id": row[0],
            "username": row[1],
            "display_name": row[2],
            "created_at": row[3].isoformat() + "Z" if row[3] else None,
            "is_online": row[4],
        })

    return {"users": users}


@router.get("/admin/{token}", response_class=HTMLResponse)
async def admin_panel(token: str):
    verify_admin_token(token)

    # ============================================================
    # FRONTEND DEVELOPER VERSION
    # The beautiful HTML/CSS/JS will be provided by the frontend developer.
    # Replace the entire return below with the final admin UI.
    #
    # Available endpoints for the UI:
    #   GET /admin/{token}/stats
    #   GET /admin/{token}/users?limit=50
    # ============================================================
    return """<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>SoMessenger Admin</title>
    <style>body{font-family:system-ui;background:#111;color:#ddd;padding:40px}</style>
</head>
<body>
    <h1>SoMessenger Admin</h1>
    <p>Frontend UI will be loaded here.</p>
    <p style="color:#666">This placeholder will be replaced with the final beautiful version.</p>
</body>
</html>"""
