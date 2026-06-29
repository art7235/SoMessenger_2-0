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
    online_users = (await db.execute(select(func.count(User.id)).where(User.is_online == True))).scalar() or 0
    total_chats = (await db.execute(select(func.count(Chat.id)).where(Chat.is_group == False))).scalar() or 0
    total_groups = (await db.execute(select(func.count(Chat.id)).where(Chat.is_group == True))).scalar() or 0
    total_channels = (await db.execute(select(func.count(Channel.id)))).scalar() or 0
    total_messages = (await db.execute(select(func.count(Message.id)))).scalar() or 0
    today_messages = (await db.execute(select(func.count(Message.id)).where(Message.created_at >= today))).scalar() or 0

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
        select(User.id, User.username, User.display_name, User.email, User.created_at, User.is_online, User.is_verified)
        .order_by(User.created_at.desc())
        .limit(limit)
    )

    users = []
    for row in result.all():
        users.append({
            "id": row[0],
            "username": row[1],
            "display_name": row[2],
            "email": row[3],
            "created_at": row[4].isoformat() + "Z" if row[4] else None,
            "is_online": row[5],
            "is_verified": row[6],
        })

    return {"users": users}


@router.get("/admin/{token}", response_class=HTMLResponse)
async def admin_panel(token: str):
    verify_admin_token(token)
    return """<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SoMessenger Admin</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg-primary:#0d001a;--bg-secondary:#1a0a2e;--bg-tertiary:#2d1b4e;--accent:#b06ef3;--accent-hover:#9333ea;--text-primary:#fff;--text-secondary:#c4b5fd;--text-muted:#8b5cf6;--border:#3b1f6e;--success:#22c55e;--danger:#ef4444;--warning:#f59e0b;--shadow:rgba(0,0,0,.6)}
html,body{min-height:100%;width:100%}
body{background:radial-gradient(circle at 20% 0%,rgba(176,110,243,.18),transparent 32%),radial-gradient(circle at 85% 15%,rgba(147,51,234,.14),transparent 28%),var(--bg-primary);color:var(--text-primary);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
.container{max-width:1120px;margin:0 auto;padding:24px 18px 38px;min-height:100vh;display:flex;flex-direction:column}
header{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:18px 0 24px;border-bottom:1px solid rgba(59,31,110,.9);margin-bottom:28px;flex-wrap:wrap}.header-left{display:flex;align-items:center;gap:13px}.header-logo{width:52px;height:52px;border-radius:18px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--accent),var(--accent-hover));font-size:28px;box-shadow:0 12px 35px rgba(176,110,243,.25)}.header-title{font-size:24px;font-weight:800;letter-spacing:.2px}.header-subtitle{font-size:13px;color:var(--text-secondary);margin-top:3px}.header-status{display:flex;align-items:center;gap:8px;background:rgba(26,10,46,.78);border:1px solid var(--border);border-radius:999px;padding:8px 14px;color:var(--text-secondary);box-shadow:0 8px 28px rgba(0,0,0,.25)}.status-dot{width:9px;height:9px;border-radius:50%;background:var(--success);box-shadow:0 0 14px var(--success);animation:pulse 1.8s ease-in-out infinite}@keyframes pulse{50%{opacity:.45;transform:scale(.86)}}
.stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:30px}.stat-card{background:linear-gradient(180deg,rgba(45,27,78,.78),rgba(26,10,46,.94));border:1px solid var(--border);border-radius:20px;padding:22px 18px;min-height:142px;position:relative;overflow:hidden;box-shadow:0 12px 36px rgba(0,0,0,.22);transition:transform .18s,border-color .18s,box-shadow .18s}.stat-card:before{content:'';position:absolute;inset:-80px -80px auto auto;width:160px;height:160px;background:radial-gradient(circle,rgba(176,110,243,.22),transparent 66%);pointer-events:none}.stat-card:hover{transform:translateY(-3px);border-color:var(--accent);box-shadow:0 16px 44px rgba(176,110,243,.16)}.stat-icon{font-size:28px;margin-bottom:12px;position:relative}.stat-value{font-size:34px;font-weight:900;line-height:1.05;margin-bottom:7px;background:linear-gradient(135deg,#fff,var(--accent));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;position:relative}.stat-label{font-size:13px;color:var(--text-secondary);font-weight:600;position:relative}.stat-card.online .stat-value{background:linear-gradient(135deg,#bbf7d0,var(--success));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}.stat-card.today .stat-value{background:linear-gradient(135deg,#fde68a,var(--warning));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.users-section{flex:1}.users-header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px;flex-wrap:wrap}.users-header h2{font-size:19px;display:flex;align-items:center;gap:8px}.users-count{font-size:13px;color:var(--text-muted)}.users-table-wrap{background:rgba(26,10,46,.94);border:1px solid var(--border);border-radius:20px;overflow:hidden;box-shadow:0 14px 38px rgba(0,0,0,.25)}.users-table{width:100%;border-collapse:collapse}.users-table thead{background:rgba(45,27,78,.9)}.users-table th{padding:14px 16px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.55px;color:var(--text-muted);border-bottom:1px solid var(--border)}.users-table td{padding:14px 16px;font-size:14px;border-bottom:1px solid rgba(59,31,110,.55);vertical-align:middle}.users-table tbody tr{transition:background .15s}.users-table tbody tr:hover{background:rgba(176,110,243,.07)}.users-table tbody tr:last-child td{border-bottom:none}.user-name-cell{display:flex;align-items:center;gap:11px}.user-avatar{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--accent),var(--accent-hover));font-size:13px;font-weight:800;box-shadow:0 4px 16px rgba(176,110,243,.22);flex-shrink:0}.user-display-name{font-weight:700}.user-email{font-size:12px;color:var(--text-secondary);margin-top:2px}.status-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;font-size:12px;font-weight:700}.status-badge .dot{width:6px;height:6px;border-radius:50%}.status-badge.online{background:rgba(34,197,94,.14);color:#86efac}.status-badge.online .dot{background:var(--success)}.status-badge.offline{background:rgba(139,92,246,.14);color:var(--text-muted)}.status-badge.offline .dot{background:var(--text-muted)}.verify-badge{display:inline-flex;margin-left:6px;color:#86efac;font-size:12px}.date-cell{color:var(--text-secondary);font-size:13px;white-space:nowrap}.loading-overlay,.error-box{display:flex;align-items:center;justify-content:center;gap:9px;padding:42px;color:var(--text-secondary);font-size:14px}.error-box{color:#fecaca}.spinner{width:20px;height:20px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@keyframes newUserGlow{0%{background:rgba(34,197,94,.24)}100%{background:transparent}}tr.new-user{animation:newUserGlow 3s ease-out forwards}
footer{margin-top:28px;padding-top:18px;border-top:1px solid rgba(59,31,110,.75);text-align:center;font-size:13px;color:var(--text-muted);display:flex;flex-direction:column;gap:4px}#last-update{color:var(--accent);font-weight:700}
@media(max-width:980px){.stats-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:640px){.container{padding:16px 12px 30px}.stats-grid{grid-template-columns:1fr;gap:12px}.stat-card{min-height:auto}.users-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}.users-table{min-width:720px}.header-title{font-size:21px}}
</style>
</head>
<body>
<div class="container">
<header><div class="header-left"><div class="header-logo">💬</div><div><div class="header-title">SoMessenger Admin</div><div class="header-subtitle">Панель мониторинга</div></div></div><div class="header-status"><div class="status-dot"></div><span>Live</span></div></header>
<section class="stats-grid">
<div class="stat-card"><div class="stat-icon">👥</div><div class="stat-value" id="stat-users">—</div><div class="stat-label">Пользователей</div></div>
<div class="stat-card online"><div class="stat-icon">🟢</div><div class="stat-value" id="stat-online">—</div><div class="stat-label">Онлайн</div></div>
<div class="stat-card"><div class="stat-icon">💬</div><div class="stat-value" id="stat-chats">—</div><div class="stat-label">Личных чатов</div></div>
<div class="stat-card"><div class="stat-icon">👨‍👩‍👧‍👦</div><div class="stat-value" id="stat-groups">—</div><div class="stat-label">Групп</div></div>
<div class="stat-card"><div class="stat-icon">📢</div><div class="stat-value" id="stat-channels">—</div><div class="stat-label">Каналов</div></div>
<div class="stat-card"><div class="stat-icon">✉️</div><div class="stat-value" id="stat-messages">—</div><div class="stat-label">Сообщений всего</div></div>
<div class="stat-card today"><div class="stat-icon">📨</div><div class="stat-value" id="stat-today">—</div><div class="stat-label">Сообщений сегодня</div></div>
</section>
<section class="users-section"><div class="users-header"><h2>📋 Последние регистрации</h2><span class="users-count" id="users-count"></span></div><div class="users-table-wrap"><table class="users-table"><thead><tr><th>Пользователь</th><th>Username</th><th>Дата регистрации</th><th>Статус</th></tr></thead><tbody id="users-tbody"><tr><td colspan="4"><div class="loading-overlay"><div class="spinner"></div>Загрузка…</div></td></tr></tbody></table></div></section>
<footer><span>Данные обновляются автоматически</span><span>Последнее обновление: <span id="last-update">—</span></span></footer>
</div>
<script>
(function(){
const token=window.location.pathname.split('/admin/')[1]?.split('/')[0]||'';const knownUserIds=new Set();let firstUsersLoad=true;const MONTHS=['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
function escapeHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')}
function initials(n){return String(n||'?').split(' ').filter(Boolean).map(w=>w[0]).join('').toUpperCase().slice(0,2)||'?'}
function num(n){return n==null?'—':Number(n).toLocaleString('ru-RU')}
function date(iso){if(!iso)return'—';const d=new Date(iso);return `${String(d.getDate()).padStart(2,'0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
function last(){const n=new Date();document.getElementById('last-update').textContent=`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`}
async function loadStats(){try{const r=await fetch(`/admin/${token}/stats`,{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const d=await r.json();[['stat-users',d.total_users],['stat-online',d.online_users],['stat-chats',d.total_chats],['stat-groups',d.total_groups],['stat-channels',d.total_channels],['stat-messages',d.total_messages],['stat-today',d.today_messages]].forEach(([id,v])=>document.getElementById(id).textContent=num(v));last()}catch(e){console.error(e)}}
async function loadUsers(){const tb=document.getElementById('users-tbody');try{const r=await fetch(`/admin/${token}/users?limit=50`,{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const d=await r.json();const users=d.users||[];document.getElementById('users-count').textContent=`${users.length} пользователей`;const newIds=new Set();if(!firstUsersLoad)users.forEach(u=>{if(!knownUserIds.has(u.id))newIds.add(u.id)});users.forEach(u=>knownUserIds.add(u.id));firstUsersLoad=false;tb.innerHTML=users.length?users.map(u=>`<tr${newIds.has(u.id)?' class="new-user"':''}><td><div class="user-name-cell"><div class="user-avatar">${initials(u.display_name)}</div><div><div class="user-display-name">${escapeHtml(u.display_name)}${u.is_verified?'<span class="verify-badge">✓</span>':''}</div><div class="user-email">${escapeHtml(u.email||'')}</div></div></div></td><td style="color:var(--accent);font-weight:700">@${escapeHtml(u.username)}</td><td class="date-cell">${date(u.created_at)}</td><td><span class="status-badge ${u.is_online?'online':'offline'}"><span class="dot"></span>${u.is_online?'Онлайн':'Оффлайн'}</span></td></tr>`).join(''):'<tr><td colspan="4"><div class="loading-overlay">Пока нет пользователей</div></td></tr>';last()}catch(e){console.error(e);tb.innerHTML='<tr><td colspan="4"><div class="error-box">Не удалось загрузить пользователей</div></td></tr>'}}
setInterval(loadStats,10000);setInterval(loadUsers,5000);loadStats();loadUsers();
})();
</script>
</body>
</html>"""
