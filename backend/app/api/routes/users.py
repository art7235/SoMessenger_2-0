from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User
from app.services.user_service import UserService
from app.core.config import settings
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
import aiofiles, os, uuid
from PIL import Image
import io

router = APIRouter(prefix="/users", tags=["users"])
security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: AsyncSession = Depends(get_db)):
    payload = decode_token(credentials.credentials)
    if not payload: raise HTTPException(401,"Недействительный токен")
    user = await UserService.get_user_by_id(db, int(payload["sub"]))
    if not user: raise HTTPException(401,"Пользователь не найден")
    return user

@router.get("/me")
async def get_me(u: User = Depends(get_current_user)):
    return {"id":u.id,"username":u.username,"display_name":u.display_name,"email":u.email,"bio":u.bio,
        "avatar_url":u.avatar_url,"is_online":u.is_online,
        "last_seen":u.last_seen.isoformat()+"Z" if u.last_seen else None,
        "created_at":u.created_at.isoformat()+"Z" if u.created_at else None}

@router.put("/me")
async def update_profile(data: dict, u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if data.get("display_name"): u.display_name=data["display_name"]
    if "bio" in data: u.bio=data["bio"]
    await db.commit(); return {"message":"Профиль обновлён"}

@router.post("/me/avatar")
async def upload_avatar(file: UploadFile = File(...), u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if file.content_type not in ["image/jpeg","image/png","image/webp"]: raise HTTPException(400,"Только JPEG, PNG, WEBP")
    content = await file.read()
    img = Image.open(io.BytesIO(content)).convert("RGB"); img.thumbnail((400,400))
    fn = f"{uuid.uuid4()}.jpg"
    os.makedirs(os.path.join(settings.UPLOAD_DIR,"avatars"),exist_ok=True)
    img.save(os.path.join(settings.UPLOAD_DIR,"avatars",fn),"JPEG",quality=85)
    u.avatar_url = f"/uploads/avatars/{fn}"; await db.commit()
    return {"avatar_url":u.avatar_url}

@router.get("/search")
async def search_users(q: str, u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    users = await UserService.search_users(db, q, u.id)
    return [{"id":x.id,"username":x.username,"display_name":x.display_name,"avatar_url":x.avatar_url,"is_online":x.is_online} for x in users]

@router.get("/{user_id}")
async def get_user(user_id: int, db: AsyncSession = Depends(get_db)):
    u = await UserService.get_user_by_id(db, user_id)
    if not u: raise HTTPException(404,"Не найден")
    return {"id":u.id,"username":u.username,"display_name":u.display_name,"avatar_url":u.avatar_url,"is_online":u.is_online}
