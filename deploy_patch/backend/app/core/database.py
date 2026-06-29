from sqlalchemy import select, text, inspect
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.core.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False, future=True)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with AsyncSessionLocal() as session:
        try: yield session
        finally: await session.close()

async def _encrypt_existing_text_fields(db: AsyncSession):
    """Encrypt old plaintext rows in-place.

    New writes are encrypted by services/routes. This migration protects data that
    was created by older versions while leaving already encrypted values untouched.
    """
    from app.core.encryption import encrypt_text, is_encrypted
    from app.models.message import Message
    from app.models.channel import ChannelPost, PostComment

    changed = False
    for model in (Message, ChannelPost, PostComment):
        result = await db.execute(select(model))
        for row in result.scalars().all():
            if row.content and not is_encrypted(row.content):
                row.content = encrypt_text(row.content)
                changed = True
    if changed:
        await db.commit()


async def create_tables():
    async with engine.begin() as conn:
        from app.models import user, chat, message, channel, sticker, reaction
        await conn.run_sync(Base.metadata.create_all)

        # Lightweight compatibility migration for deployments already running v5.
        # SQLAlchemy create_all() does not add new columns to existing tables, while
        # the channel-comments redesign needs one common discussion chat per channel
        # and a way to link mirrored discussion messages back to channel posts.
        async def has_column(table_name: str, column_name: str) -> bool:
            def _check(sync_conn):
                return any(c["name"] == column_name for c in inspect(sync_conn).get_columns(table_name))
            return await conn.run_sync(_check)

        if not await has_column("chats", "channel_id"):
            await conn.execute(text("ALTER TABLE chats ADD COLUMN channel_id INTEGER REFERENCES channels(id)"))
        if not await has_column("messages", "channel_post_id"):
            await conn.execute(text("ALTER TABLE messages ADD COLUMN channel_post_id INTEGER REFERENCES channel_posts(id)"))
        if not await has_column("messages", "duration"):
            await conn.execute(text("ALTER TABLE messages ADD COLUMN duration INTEGER"))
        if not await has_column("messages", "forward_from_id"):
            await conn.execute(text("ALTER TABLE messages ADD COLUMN forward_from_id INTEGER REFERENCES messages(id)"))

        # Compatibility migration for older local/production databases.
        # create_all() creates missing tables, but does not add missing columns.
        if not await has_column("users", "bio"):
            await conn.execute(text("ALTER TABLE users ADD COLUMN bio TEXT"))
        if not await has_column("users", "is_active"):
            await conn.execute(text("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1"))
        if not await has_column("users", "is_verified"):
            await conn.execute(text("ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT 1"))
        if not await has_column("users", "verification_code"):
            await conn.execute(text("ALTER TABLE users ADD COLUMN verification_code VARCHAR(6)"))
        if not await has_column("users", "verification_code_expires"):
            await conn.execute(text("ALTER TABLE users ADD COLUMN verification_code_expires DATETIME"))
        if not await has_column("users", "last_seen"):
            await conn.execute(text("ALTER TABLE users ADD COLUMN last_seen DATETIME"))
        if not await has_column("users", "is_online"):
            await conn.execute(text("ALTER TABLE users ADD COLUMN is_online BOOLEAN DEFAULT 0"))

        await conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_chats_channel_id_unique ON chats(channel_id) WHERE channel_id IS NOT NULL"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_messages_channel_post_id ON messages(channel_post_id)"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_messages_forward_from_id ON messages(forward_from_id)"))
    async with AsyncSessionLocal() as db:
        from app.models.sticker import StickerPack, Sticker
        r = await db.execute(select(StickerPack))
        if not r.scalars().first():
            pack = StickerPack(name="Базовый набор",thumbnail_url="https://api.dicebear.com/7.x/bottts/svg?seed=stickers")
            db.add(pack); await db.commit(); await db.refresh(pack)
            stickers = [
                Sticker(pack_id=pack.id,emoji="😊",file_url="https://api.dicebear.com/7.x/fun-emoji/svg?seed=1"),
                Sticker(pack_id=pack.id,emoji="😂",file_url="https://api.dicebear.com/7.x/fun-emoji/svg?seed=2"),
                Sticker(pack_id=pack.id,emoji="😎",file_url="https://api.dicebear.com/7.x/fun-emoji/svg?seed=3"),
                Sticker(pack_id=pack.id,emoji="🤔",file_url="https://api.dicebear.com/7.x/fun-emoji/svg?seed=4"),
                Sticker(pack_id=pack.id,emoji="🔥",file_url="https://api.dicebear.com/7.x/fun-emoji/svg?seed=5"),
                Sticker(pack_id=pack.id,emoji="❤️",file_url="https://api.dicebear.com/7.x/fun-emoji/svg?seed=6"),
                Sticker(pack_id=pack.id,emoji="👍",file_url="https://api.dicebear.com/7.x/fun-emoji/svg?seed=7"),
                Sticker(pack_id=pack.id,emoji="🎉",file_url="https://api.dicebear.com/7.x/fun-emoji/svg?seed=8"),
            ]
            db.add_all(stickers); await db.commit(); print("✅ Стикеры")
        from app.models.channel import Channel
        from app.models.user import User
        from sqlalchemy import or_

        admin_username = settings.DEFAULT_ADMIN_USERNAME.strip() or "admin"
        admin_email = settings.DEFAULT_ADMIN_EMAIL.strip() or "admin@so.me"
        admin_display = settings.DEFAULT_ADMIN_DISPLAY_NAME.strip() or admin_username
        admin_password = settings.DEFAULT_ADMIN_PASSWORD or "admin123"

        r2 = await db.execute(select(User).where(or_(User.username==admin_username, User.email==admin_email)))
        admin = r2.scalar_one_or_none()
        if not admin:
            from app.core.security import get_password_hash
            admin = User(username=admin_username,email=admin_email,display_name=admin_display,
                hashed_password=get_password_hash(admin_password),is_active=True,is_verified=True)
            db.add(admin); await db.commit(); await db.refresh(admin)
            print(f"✅ Владелец создан: {admin_username} <{admin_email}>")
        else:
            changed = False
            if not admin.is_verified:
                admin.is_verified = True; admin.is_active = True; changed = True
            if admin.display_name != admin_display:
                admin.display_name = admin_display; changed = True
            if changed:
                await db.commit(); await db.refresh(admin)

        channel_username = (settings.DEFAULT_CHANNEL_USERNAME.strip() or "somessenger").lower().replace("@", "")
        r = await db.execute(select(Channel).where(Channel.username==channel_username))
        ch = r.scalars().first()
        if not ch:
            ch = Channel(name=settings.DEFAULT_CHANNEL_NAME,username=channel_username,
                description=settings.DEFAULT_CHANNEL_DESCRIPTION,owner_id=admin.id,is_public=True)
            db.add(ch); await db.commit(); await db.refresh(ch)
            from app.models.channel import ChannelPost
            db.add(ChannelPost(channel_id=ch.id,author_id=admin.id,
                content="Добро пожаловать в SoMessenger! 🎉\n\nЭто официальный канал новостей.",message_type="text"))
            await db.commit(); print("✅ Канал создан")
        elif ch.owner_id != admin.id:
            ch.owner_id = admin.id
            await db.commit(); print("✅ Канал SoMessenger передан владельцу")
        await _encrypt_existing_text_fields(db)
