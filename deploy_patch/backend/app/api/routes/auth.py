from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta
from app.core.database import get_db
from app.core.security import create_access_token, get_password_hash, verify_password, generate_verification_code
from app.services.user_service import UserService
from app.models.user import User
from app.api.routes.users import get_current_user
from app.core.config import settings
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

router = APIRouter(prefix="/auth", tags=["auth"])

class RegisterRequest(BaseModel): username: str; email: EmailStr; password: str; display_name: str
class VerifyRequest(BaseModel): email: EmailStr; code: str
class LoginRequest(BaseModel): email: EmailStr; password: str
class ChangePasswordRequest(BaseModel): current_password: str; new_password: str
class ResetRequest(BaseModel): email: EmailStr
class ResetConfirm(BaseModel): email: EmailStr; code: str; new_password: str

def _ud(u): return {"id":u.id,"username":u.username,"display_name":u.display_name,"email":u.email,"avatar_url":u.avatar_url}

async def _send_password_reset_email(email: str, display_name: str, code: str):
    print(f"\n{'='*50}\n🔓 КОД СБРОСА ДЛЯ {email}: {code}\n{'='*50}\n")
    if not (settings.SMTP_USER and settings.SMTP_PASSWORD):
        return
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "SoMessenger — восстановление пароля"
        msg["From"] = settings.SMTP_USER
        msg["To"] = email
        html = f"""<html><body style="background:#1a0533;font-family:Arial;color:#fff;padding:40px;">
        <div style="max-width:500px;margin:0 auto;background:#2d1054;border-radius:16px;padding:32px;text-align:center;">
        <h1 style="color:#b06ef3;">SoMessenger</h1><p>Привет, {display_name}!</p>
        <p>Код восстановления пароля:</p>
        <b style="font-size:36px;letter-spacing:8px;color:#b06ef3;">{code}</b>
        <p style="color:#888;font-size:14px;margin-top:18px;">Действителен 10 минут. Если это были не вы — просто игнорируйте письмо.</p>
        </div></body></html>"""
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as s:
            s.starttls(); s.login(settings.SMTP_USER, settings.SMTP_PASSWORD); s.sendmail(settings.SMTP_USER, email, msg.as_string())
    except Exception as e:
        print(f"⚠️ SMTP reset: {e}")

@router.post("/register")
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    if (await db.execute(select(User).where((User.email==data.email)|(User.username==data.username)))).scalar_one_or_none():
        raise HTTPException(400,"Пользователь уже существует")
    if len(data.password)<6: raise HTTPException(400,"Пароль должен быть не менее 6 символов")
    user = await UserService.create_user(db, data.username, data.email, data.password, data.display_name)
    if user.is_verified:
        token = create_access_token({"sub":str(user.id)})
        return {"message":"Успешная регистрация","access_token":token,"token_type":"bearer","user":_ud(user)}
    return {"message":"Код отправлен на почту"}

@router.post("/verify")
async def verify(data: VerifyRequest, db: AsyncSession = Depends(get_db)):
    user = await UserService.verify_user(db, data.email, data.code)
    if not user: raise HTTPException(400,"Неверный код")
    token = create_access_token({"sub":str(user.id)})
    return {"access_token":token,"token_type":"bearer","user":_ud(user)}

@router.post("/login")
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await UserService.authenticate_user(db, data.email, data.password)
    if not user: raise HTTPException(401,"Неверные данные")
    token = create_access_token({"sub":str(user.id)})
    return {"access_token":token,"token_type":"bearer","user":_ud(user)}

@router.post("/change-password")
async def change_password(data: ChangePasswordRequest, u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not verify_password(data.current_password, u.hashed_password):
        raise HTTPException(400, "Неверный текущий пароль")
    if len(data.new_password) < 6:
        raise HTTPException(400, "Пароль должен быть не менее 6 символов")
    if data.current_password == data.new_password:
        raise HTTPException(400, "Новый пароль должен отличаться от текущего")
    u.hashed_password = get_password_hash(data.new_password)
    await db.commit()
    return {"message": "Пароль изменён"}

@router.post("/request-password-reset")
async def request_password_reset(data: ResetRequest, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.email==data.email))).scalar_one_or_none()
    if not user:
        return {"message": "Если email существует, код отправлен"}
    user.verification_code = generate_verification_code()
    user.verification_code_expires = datetime.utcnow() + timedelta(minutes=10)
    await db.commit()
    await _send_password_reset_email(user.email, user.display_name, user.verification_code)
    return {"message": "Если email существует, код отправлен"}

@router.post("/reset-password")
async def reset_password(data: ResetConfirm, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.email==data.email))).scalar_one_or_none()
    if not user or user.verification_code != data.code:
        raise HTTPException(400, "Неверный код")
    if user.verification_code_expires and user.verification_code_expires < datetime.utcnow():
        raise HTTPException(400, "Код истёк")
    if len(data.new_password) < 6:
        raise HTTPException(400, "Пароль должен быть не менее 6 символов")
    user.hashed_password = get_password_hash(data.new_password)
    user.verification_code = None
    user.verification_code_expires = None
    user.is_active = True
    await db.commit()
    return {"message": "Пароль сброшен"}
