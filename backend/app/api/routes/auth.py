from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from app.core.database import get_db
from app.core.security import create_access_token
from app.services.user_service import UserService
from app.models.user import User

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
