from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.models.user import User
from app.models.sticker import StickerPack
from app.api.routes.users import get_current_user

router = APIRouter(prefix="/stickers", tags=["stickers"])
@router.get("/")
async def get_sticker_packs(u: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(StickerPack).options(selectinload(StickerPack.stickers)))
    return [{"id":p.id,"name":p.name,"thumbnail_url":p.thumbnail_url,
        "stickers":[{"id":s.id,"emoji":s.emoji,"file_url":s.file_url} for s in p.stickers]} for p in r.scalars().all()]
