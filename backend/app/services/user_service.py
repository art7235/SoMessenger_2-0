from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.models.user import User
from app.core.security import get_password_hash, verify_password, generate_verification_code
from datetime import datetime, timedelta
from typing import Optional, List
from app.core.config import settings
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

class UserService:
    @staticmethod
    async def create_user(db, username, email, password, display_name):
        hp = get_password_hash(password); code = generate_verification_code()
        expires = datetime.utcnow() + timedelta(minutes=10)
        u = User(username=username, email=email, hashed_password=hp, display_name=display_name,
                 verification_code=code, verification_code_expires=expires, is_active=True, is_verified=False)
        db.add(u); await db.commit(); await db.refresh(u)
        print(f"\n{'='*50}\n📧 КОД ДЛЯ {email}: {code}\n{'='*50}\n")
        try:
            if settings.SMTP_USER and settings.SMTP_PASSWORD:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = "SoMessenger — Код подтверждения"
                msg["From"] = settings.SMTP_USER; msg["To"] = email
                html = f"""<html><body style="background:#1a0533;font-family:Arial;color:#fff;padding:40px;">
                <div style="max-width:500px;margin:0 auto;background:#2d1054;border-radius:16px;padding:32px;text-align:center;">
                <h1 style="color:#b06ef3;">SoMessenger</h1><p>Привет, {display_name}!</p>
                <p>Твой код: <b style="font-size:36px;letter-spacing:8px;color:#b06ef3;">{code}</b></p>
                <p style="color:#888;font-size:14px;">Действителен 10 минут</p></div></body></html>"""
                msg.attach(MIMEText(html,"html"))
                with smtplib.SMTP(settings.SMTP_HOST,settings.SMTP_PORT) as s:
                    s.starttls(); s.login(settings.SMTP_USER,settings.SMTP_PASSWORD); s.sendmail(settings.SMTP_USER,email,msg.as_string())
        except Exception as e: print(f"⚠️ SMTP: {e}")
        return u
    @staticmethod
    async def verify_user(db, email, code):
        u = (await db.execute(select(User).where(User.email==email))).scalar_one_or_none()
        if not u or u.verification_code != code: return None
        if u.verification_code_expires and u.verification_code_expires < datetime.utcnow(): return None
        u.is_verified=True; u.is_active=True; u.verification_code=None; u.verification_code_expires=None
        await db.commit(); await db.refresh(u); return u
    @staticmethod
    async def authenticate_user(db, email, password):
        u = (await db.execute(select(User).where(User.email==email))).scalar_one_or_none()
        if not u or not verify_password(password, u.hashed_password): return None
        if not u.is_verified: return None
        return u
    @staticmethod
    async def get_user_by_id(db, user_id):
        return (await db.execute(select(User).where(User.id==user_id))).scalar_one_or_none()
    @staticmethod
    async def search_users(db, query, current_user_id):
        r = await db.execute(select(User).where(or_(User.username.ilike(f"%{query}%"), User.display_name.ilike(f"%{query}%")),
            User.id != current_user_id, User.is_active==True).limit(20))
        return r.scalars().all()
    @staticmethod
    async def update_online_status(db, user_id, is_online):
        u = (await db.execute(select(User).where(User.id==user_id))).scalar_one_or_none()
        if u: u.is_online=is_online; u.last_seen=datetime.utcnow(); await db.commit()
