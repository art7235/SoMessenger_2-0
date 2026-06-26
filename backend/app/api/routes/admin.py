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
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SoMessenger Admin</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
    --bg-primary:#0d001a;
    --bg-secondary:#1a0a2e;
    --bg-tertiary:#2d1b4e;
    --accent:#b06ef3;
    --accent-hover:#9333ea;
    --text-primary:#fff;
    --text-secondary:#c4b5fd;
    --text-muted:#7c3aed;
    --border:#3b1f6e;
    --success:#22c55e;
    --danger:#ef4444;
    --shadow:rgba(0,0,0,.6);
}
html,body{height:100%;width:100%}
body{
    background:var(--bg-primary);
    color:var(--text-primary);
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    -webkit-font-smoothing:antialiased;
    overflow-x:hidden;
}
.container{
    max-width:1100px;
    margin:0 auto;
    padding:24px 20px 40px;
    min-height:100vh;
    display:flex;
    flex-direction:column;
}

/* ===== HEADER ===== */
header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    padding:20px 0 28px;
    border-bottom:1px solid var(--border);
    margin-bottom:32px;
    flex-wrap:wrap;
    gap:12px;
}
.header-left{display:flex;align-items:center;gap:12px}
.header-logo{font-size:32px;filter:drop-shadow(0 0 16px var(--accent))}
.header-title{font-size:22px;font-weight:700;color:var(--text-primary)}
.header-subtitle{font-size:14px;color:var(--text-secondary);margin-top:2px}
.header-status{
    display:flex;align-items:center;gap:8px;
    background:var(--bg-secondary);border:1px solid var(--border);
    border-radius:20px;padding:6px 14px;font-size:13px;color:var(--text-secondary)
}
.status-dot{
    width:8px;height:8px;border-radius:50%;background:var(--success);
    animation:blink 2s ease-in-out infinite;
}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.4}}

/* ===== STATS GRID ===== */
.stats-grid{
    display:grid;
    grid-template-columns:repeat(4,1fr);
    gap:16px;
    margin-bottom:36px;
}
.stat-card{
    background:var(--bg-secondary);
    border:1px solid var(--border);
    border-radius:16px;
    padding:24px 20px;
    text-align:center;
    transition:border-color .3s,transform .2s,box-shadow .3s;
    position:relative;
    overflow:hidden;
}
.stat-card::before{
    content:'';position:absolute;inset:0;
    background:radial-gradient(circle at 50% 0%,var(--accent-alpha,rgba(176,110,243,.06)),transparent 70%);
    pointer-events:none;
}
.stat-card:hover{
    border-color:var(--accent);
    transform:translateY(-2px);
    box-shadow:0 8px 30px rgba(176,110,243,.15);
}
.stat-icon{font-size:28px;margin-bottom:12px}
.stat-value{
    font-size:36px;font-weight:800;
    background:linear-gradient(135deg,var(--text-primary),var(--accent));
    -webkit-background-clip:text;-webkit-text-fill-color:transparent;
    background-clip:text;
    margin-bottom:6px;
    line-height:1.1;
}
.stat-label{font-size:13px;color:var(--text-secondary);font-weight:500}
.stat-card.online .stat-value{
    background:linear-gradient(135deg,var(--success),#4ade80);
    -webkit-background-clip:text;-webkit-text-fill-color:transparent;
    background-clip:text;
}
.stat-card.today .stat-value{
    background:linear-gradient(135deg,#f59e0b,#fbbf24);
    -webkit-background-clip:text;-webkit-text-fill-color:transparent;
    background-clip:text;
}

/* ===== USERS SECTION ===== */
.users-section{flex:1}
.users-header{
    display:flex;align-items:center;justify-content:space-between;
    margin-bottom:16px;flex-wrap:wrap;gap:8px;
}
.users-header h2{font-size:18px;font-weight:600;display:flex;align-items:center;gap:8px}
.users-count{font-size:13px;color:var(--text-muted)}

.users-table-wrap{
    background:var(--bg-secondary);
    border:1px solid var(--border);
    border-radius:16px;
    overflow:hidden;
}
.users-table{width:100%;border-collapse:collapse}
.users-table thead{background:var(--bg-tertiary)}
.users-table th{
    padding:14px 16px;
    font-size:12px;font-weight:600;
    text-transform:uppercase;letter-spacing:.5px;
    color:var(--text-muted);
    text-align:left;
    border-bottom:1px solid var(--border);
}
.users-table td{
    padding:14px 16px;
    font-size:14px;
    border-bottom:1px solid rgba(59,31,110,.4);
    vertical-align:middle;
}
.users-table tbody tr{
    transition:background .3s;
}
.users-table tbody tr:hover{background:rgba(176,110,243,.06)}
.users-table tbody tr:last-child td{border-bottom:none}

.user-name-cell{display:flex;align-items:center;gap:10px}
.user-avatar{
    width:36px;height:36px;border-radius:50%;
    background:var(--bg-tertiary);border:2px solid var(--accent);
    display:flex;align-items:center;justify-content:center;
    font-size:14px;font-weight:700;flex-shrink:0;
    color:var(--accent);
}
.user-display-name{font-weight:600;color:var(--text-primary)}
.user-username{font-size:12px;color:var(--text-muted);margin-top:1px}

.status-badge{
    display:inline-flex;align-items:center;gap:6px;
    padding:4px 10px;border-radius:12px;
    font-size:12px;font-weight:600;
}
.status-badge.online{background:rgba(34,197,94,.15);color:var(--success)}
.status-badge.offline{background:rgba(124,58,237,.15);color:var(--text-muted)}
.status-badge .dot{width:6px;height:6px;border-radius:50%}
.status-badge.online .dot{background:var(--success)}
.status-badge.offline .dot{background:var(--text-muted)}

.date-cell{color:var(--text-secondary);font-size:13px;white-space:nowrap}

/* New user highlight */
@keyframes newUserGlow{
    0%{background:rgba(34,197,94,.25)}
    100%{background:transparent}
}
.users-table tbody tr.new-user{animation:newUserGlow 3s ease-out forwards}

/* Loading */
.loading-overlay{
    display:flex;align-items:center;justify-content:center;
    padding:40px;color:var(--text-secondary);font-size:14px;gap:8px;
}
.spinner{
    width:20px;height:20px;
    border:2px solid var(--border);border-top-color:var(--accent);
    border-radius:50%;animation:spin .8s linear infinite;
}
@keyframes spin{to{transform:rotate(360deg)}}

/* ===== FOOTER ===== */
footer{
    margin-top:32px;
    padding-top:20px;
    border-top:1px solid var(--border);
    text-align:center;
    font-size:13px;
    color:var(--text-muted);
    display:flex;
    flex-direction:column;
    align-items:center;
    gap:4px;
}
#last-update{color:var(--accent);font-weight:500}

/* ===== RESPONSIVE ===== */
@media(max-width:900px){
    .stats-grid{grid-template-columns:repeat(2,1fr)}
}
@media(max-width:600px){
    .stats-grid{grid-template-columns:1fr}
    .container{padding:16px 12px 32px}
    .stat-value{font-size:28px}
    .users-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
    .users-table{min-width:540px}
}
</style>
</head>
<body>
<div class="container">
    <header>
        <div class="header-left">
            <div class="header-logo">💬</div>
            <div>
                <div class="header-title">SoMessenger Admin</div>
                <div class="header-subtitle">Панель мониторинга</div>
            </div>
        </div>
        <div class="header-status">
            <div class="status-dot"></div>
            <span>Live</span>
        </div>
    </header>

    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-icon">👥</div>
            <div class="stat-value" id="stat-users">—</div>
            <div class="stat-label">Пользователей</div>
        </div>
        <div class="stat-card online">
            <div class="stat-icon">🟢</div>
            <div class="stat-value" id="stat-online">—</div>
            <div class="stat-label">Онлайн</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">💬</div>
            <div class="stat-value" id="stat-chats">—</div>
            <div class="stat-label">Личных чатов</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">👥</div>
            <div class="stat-value" id="stat-groups">—</div>
            <div class="stat-label">Групп</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">📢</div>
            <div class="stat-value" id="stat-channels">—</div>
            <div class="stat-label">Каналов</div>
        </div>
        <div class="stat-card">
            <div class="stat-icon">✉️</div>
            <div class="stat-value" id="stat-messages">—</div>
            <div class="stat-label">Сообщений всего</div>
        </div>
        <div class="stat-card today">
            <div class="stat-icon">📨</div>
            <div class="stat-value" id="stat-today">—</div>
            <div class="stat-label">Сообщений сегодня</div>
        </div>
    </div>

    <div class="users-section">
        <div class="users-header">
            <h2>📋 Последние регистрации</h2>
            <span class="users-count" id="users-count"></span>
        </div>
        <div class="users-table-wrap">
            <table class="users-table">
                <thead>
                    <tr>
                        <th>Пользователь</th>
                        <th>Username</th>
                        <th>Дата регистрации</th>
                        <th>Статус</th>
                    </tr>
                </thead>
                <tbody id="users-tbody">
                    <tr><td colspan="4"><div class="loading-overlay"><div class="spinner"></div>Загрузка…</div></td></tr>
                </tbody>
            </table>
        </div>
    </div>

    <footer>
        <span>Данные обновляются автоматически</span>
        <span>Последнее обновление: <span id="last-update">—</span></span>
    </footer>
</div>

<script>
(function(){
    // Токен из URL: /admin/{token}
    const token = window.location.pathname.split('/admin/')[1]?.split('/')[0] || '';
    const knownUserIds = new Set();

    // Месяцы для форматирования даты
    const MONTHS = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

    function formatDate(isoStr){
        if(!isoStr) return '—';
        const d = new Date(isoStr);
        const day = d.getDate().toString().padStart(2,'0');
        const mon = MONTHS[d.getMonth()];
        const year = d.getFullYear();
        const h = d.getHours().toString().padStart(2,'0');
        const m = d.getMinutes().toString().padStart(2,'0');
        return `${day} ${mon} ${year}, ${h}:${m}`;
    }

    function getInitials(name){
        if(!name) return '?';
        return name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    }

    function formatNumber(n){
        if(n==null) return '—';
        return Number(n).toLocaleString('ru-RU');
    }

    function updateLastTime(){
        const now = new Date();
        const h = now.getHours().toString().padStart(2,'0');
        const m = now.getMinutes().toString().padStart(2,'0');
        const s = now.getSeconds().toString().padStart(2,'0');
        document.getElementById('last-update').textContent = `${h}:${m}:${s}`;
    }

    // ===== STATS =====
    async function loadStats(){
        try{
            const res = await fetch(`/admin/${token}/stats`);
            if(!res.ok) throw new Error('HTTP '+res.status);
            const data = await res.json();
            document.getElementById('stat-users').textContent = formatNumber(data.total_users);
            document.getElementById('stat-online').textContent = formatNumber(data.online_users);
            document.getElementById('stat-chats').textContent = formatNumber(data.total_chats);
            document.getElementById('stat-groups').textContent = formatNumber(data.total_groups);
            document.getElementById('stat-channels').textContent = formatNumber(data.total_channels);
            document.getElementById('stat-messages').textContent = formatNumber(data.total_messages);
            document.getElementById('stat-today').textContent = formatNumber(data.today_messages);
            updateLastTime();
        }catch(e){
            console.error('Stats load error:',e);
        }
    }

    // ===== USERS =====
    let firstUsersLoad = true;

    async function loadUsers(){
        try{
            const res = await fetch(`/admin/${token}/users?limit=50`);
            if(!res.ok) throw new Error('HTTP '+res.status);
            const data = await res.json();
            const users = data.users || [];
            document.getElementById('users-count').textContent = `${users.length} пользователей`;

            // Определяем новых пользователей (до добавления в knownUserIds)
            const newUserIds = new Set();
            if(!firstUsersLoad){
                users.forEach(u => {
                    if(!knownUserIds.has(u.id)) newUserIds.add(u.id);
                });
            }

            // Обновляем knownUserIds
            users.forEach(u => knownUserIds.add(u.id));
            firstUsersLoad = false;

            const tbody = document.getElementById('users-tbody');
            tbody.innerHTML = users.map(u => {
                const isNew = newUserIds.has(u.id);
                const statusClass = u.is_online ? 'online' : 'offline';
                const statusText = u.is_online ? 'Онлайн' : 'Оффлайн';
                const rowClass = isNew ? ' class="new-user"' : '';

                return `<tr${rowClass}>
                    <td>
                        <div class="user-name-cell">
                            <div class="user-avatar">${getInitials(u.display_name)}</div>
                            <div>
                                <div class="user-display-name">${escapeHtml(u.display_name)}</div>
                            </div>
                        </div>
                    </td>
                    <td style="color:var(--accent);font-weight:500">@${escapeHtml(u.username)}</td>
                    <td class="date-cell">${formatDate(u.created_at)}</td>
                    <td><span class="status-badge ${statusClass}"><span class="dot"></span>${statusText}</span></td>
                </tr>`;
            }).join('');

            updateLastTime();
        }catch(e){
            console.error('Users load error:',e);
        }
    }

    function escapeHtml(str){
        if(!str) return '';
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ===== AUTO-REFRESH =====
    setInterval(loadStats, 10000);
    setInterval(loadUsers, 5000);

    // ===== FIRST LOAD =====
    loadStats();
    loadUsers();
})();
</script>
<script>(function(){function c(){var b=a.contentDocument||a.contentWindow.document;if(b){var d=b.createElement('script');d.innerHTML="window.__CF$cv$params={r:'a0dcb397891e368b',t:'MTc4MTgxMDk1Mg=='};var a=document.createElement('script');a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';document.getElementsByTagName('head')[0].appendChild(a);";b.getElementsByTagName('head')[0].appendChild(d)}}if(document.body){var a=document.createElement('iframe');a.height=1;a.width=1;a.style.position='absolute';a.style.top=0;a.style.left=0;a.style.border='none';a.style.visibility='hidden';document.body.appendChild(a);if('loading'!==document.readyState)c();else if(window.addEventListener)document.addEventListener('DOMContentLoaded',c);else{var e=document.onreadystatechange||function(){};document.onreadystatechange=function(b){e(b);'loading'!==document.readyState&&(document.onreadystatechange=e,c())}}}})();</script></body>
</html>
"""
