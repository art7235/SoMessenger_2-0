from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from app.core.database import get_db
from app.core.security import create_access_token, get_password_hash, verify_password, generate_verification_code
from datetime import datetime, timedelta
from app.services.user_service import UserService
from app.models.user import User
from app.api.routes.users import get_current_user
from app.services.user_service import UserService

router = APIRouter(prefix="/auth", tags=["auth"])
class RegisterRequest(BaseModel): username: str; email: EmailStr; password: str; display_name: str
class VerifyRequest(BaseModel): email: EmailStr; code: str
class LoginRequest(BaseModel): email: EmailStr; password: str
def _ud(u): return {"id":u.id,"username":u.username,"display_name":u.display_name,"email":u.email,"avatar_url":u.avatar_url}

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


# Password management endpoints

from app.core.security import get_password_hash, verify_password

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

@router.post("/change-password")
async def change_password(data: ChangePasswordRequest, u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Need a helper to get user from token in this file scope
    if not verify_password(data.current_password, u.hashed_password):
        raise HTTPException(400, "Неверный текущий пароль")
    if len(data.new_password) < 6:
        raise HTTPException(400, "Пароль слишком короткий")
    u.hashed_password = get_password_hash(data.new_password)
    await db.commit()
    return {"message": "Пароль изменён"}

class ResetRequest(BaseModel):
    email: EmailStr

@router.post("/request-password-reset")
async def request_password_reset(data: ResetRequest, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.email==data.email))).scalar_one_or_none()
    if not user:
        return {"message": "Если email существует, код отправлен"}
    # reuse existing verification flow
    user.verification_code = generate_verification_code()
    user.verification_code_expires = datetime.utcnow() + timedelta(minutes=10)
    await db.commit()
    # send email (reuse logic)
    print(f"RESET CODE for {data.email}: {user.verification_code}")
    return {"message": "Код для сброса отправлен"}

class ResetConfirm(BaseModel):
    email: EmailStr
    code: str
    new_password: str

@router.post("/reset-password")
async def reset_password(data: ResetConfirm, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.email==data.email))).scalar_one_or_none()
    if not user or user.verification_code != data.code:
        raise HTTPException(400, "Неверный код")
    if len(data.new_password) < 6: raise HTTPException(400, "Пароль короткий")
    user.hashed_password = get_password_hash(data.new_password)
    user.verification_code = None
    user.verification_code_expires = None
    await db.commit()
    return {"message": "Пароль сброшен"}
