from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.models.user import User
from app.models.chat import Chat
from app.models.message import Message
from app.core.config import settings
from datetime import datetime, timedelta

router = APIRouter(tags=["admin"])

def verify_admin_token(token: str):
    if token != settings.ADMIN_PANEL_TOKEN:
        raise HTTPException(status_code=404, detail="Not Found")

@router.get("/admin/{token}/stats")
async def get_admin_stats(token: str, db: AsyncSession = Depends(get_db)):
    verify_admin_token(token)
    
    user_count = await db.execute(select(func.count(User.id)))
    chat_count = await db.execute(select(func.count(Chat.id)))
    msg_count = await db.execute(select(func.count(Message.id)))
    
    # Регистрации за последние 24 часа
    yesterday = datetime.utcnow() - timedelta(days=1)
    new_users = await db.execute(select(func.count(User.id)).where(User.created_at >= yesterday))
    
    return {
        "total_users": user_count.scalar(),
        "total_chats": chat_count.scalar(),
        "total_messages": msg_count.scalar(),
        "new_users_24h": new_users.scalar()
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
    return """
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <title>SoMessenger Admin Panel</title>
        <style>
            :root { --bg: #0f0f0f; --card: #1a1a1a; --primary: #0088cc; --text: #efefef; }
            body { font-family: 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 20px; }
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
            .card { background: var(--card); padding: 20px; border-radius: 12px; border: 1px solid #333; text-align: center; }
            .card h3 { margin: 0; color: #888; font-size: 14px; text-transform: uppercase; }
            .card p { font-size: 32px; font-weight: bold; margin: 10px 0 0 0; color: var(--primary); }
            .table-wrap { background: var(--card); border-radius: 12px; border: 1px solid #333; overflow: hidden; }
            table { width: 100%; border-collapse: collapse; }
            th { background: #252525; padding: 12px; text-align: left; font-size: 13px; color: #888; }
            td { padding: 12px; border-top: 1px solid #333; font-size: 14px; }
            .online { color: #4caf50; font-weight: bold; }
            .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
            .refresh-btn { background: var(--primary); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Панель управления SoMessenger</h1>
            <button class="refresh-btn" onclick="loadData()">Обновить данные</button>
        </div>
        <div class="grid">
            <div class="card"><h3>Всего пользователей</h3><p id="stat-users">...</p></div>
            <div class="card"><h3>Чатов</h3><p id="stat-chats">...</p></div>
            <div class="card"><h3>Сообщений</h3><p id="stat-msgs">...</p></div>
            <div class="card"><h3>Новых (24ч)</h3><p id="stat-new">...</p></div>
        </div>
        <h2>Последние регистрации</h2>
        <div class="table-wrap">
            <table>
                <thead>
                    <tr><th>ID</th><th>Имя</th><th>Username</th><th>Дата</th><th>Статус</th></tr>
                </thead>
                <tbody id="users-table"></tbody>
            </table>
        </div>

        <script>
            const token = window.location.pathname.split('/').pop();
            async function loadData() {
                try {
                    const s = await fetch(`/api/admin/${token}/stats`).then(r => r.json());
                    document.getElementById('stat-users').textContent = s.total_users;
                    document.getElementById('stat-chats').textContent = s.total_chats;
                    document.getElementById('stat-msgs').textContent = s.total_messages;
                    document.getElementById('stat-new').textContent = s.new_users_24h;

                    const u = await fetch(`/api/admin/${token}/users`).then(r => r.json());
                    const tbody = document.getElementById('users-table');
                    tbody.innerHTML = u.users.map(user => `
                        <tr>
                            <td>${user.id}</td>
                            <td>${user.display_name}</td>
                            <td>@${user.username}</td>
                            <td>${new Date(user.created_at).toLocaleString()}</td>
                            <td class="${user.is_online ? 'online' : ''}">${user.is_online ? 'Online' : 'Offline'}</td>
                        </tr>
                    `).join('');
                } catch(e) { alert('Ошибка загрузки данных'); }
            }
            loadData();
            setInterval(loadData, 30000);
        </script>
    </body>
    </html>
    """