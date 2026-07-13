import secrets
from datetime import datetime
from sqlalchemy import select, and_, delete
from sqlalchemy.orm import selectinload
from app.models.chat import Chat, ChatMember
from app.models.channel import Channel, ChannelSubscriber
from app.models.membership import InviteLink, Ban, AuditLogEntry
from app.models.user import User
from app.services.chat_service import ChatService

ROLE_RANK = {"owner": 3, "admin": 2, "member": 1, "subscriber": 1}

ALL_PERMISSIONS = {"change_info", "ban", "mute", "invite", "add_admins"}
DEFAULT_ADMIN_PERMISSIONS = ALL_PERMISSIONS - {"add_admins"}


def _resolve_permissions(role: str, raw: str) -> set:
    if role == "owner":
        return set(ALL_PERMISSIONS)
    if role == "admin":
        if raw is None:
            return set(DEFAULT_ADMIN_PERMISSIONS)
        return {p for p in raw.split(",") if p in ALL_PERMISSIONS}
    return set()


class InviteError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code


class MembershipService:
    # ---- roles / member list -------------------------------------------------

    @staticmethod
    async def get_role(db, kind: str, target_id: int, user_id: int):
        if kind == "chat":
            m = (await db.execute(select(ChatMember).where(and_(
                ChatMember.chat_id == target_id, ChatMember.user_id == user_id
            )))).scalar_one_or_none()
            return m.role if m else None
        ch = (await db.execute(select(Channel).where(Channel.id == target_id))).scalar_one_or_none()
        if ch and ch.owner_id == user_id:
            return "owner"
        s = (await db.execute(select(ChannelSubscriber).where(and_(
            ChannelSubscriber.channel_id == target_id, ChannelSubscriber.user_id == user_id
        )))).scalar_one_or_none()
        return s.role if s else None

    @staticmethod
    async def list_members(db, kind: str, target_id: int):
        if kind == "chat":
            rows = (await db.execute(select(ChatMember).where(ChatMember.chat_id == target_id)
                .options(selectinload(ChatMember.user)))).scalars().all()
            return sorted([{
                "user_id": r.user_id, "display_name": r.user.display_name, "username": r.user.username,
                "avatar_url": r.user.avatar_url, "is_online": r.user.is_online,
                "role": r.role or "member", "muted_until": r.muted_until.isoformat() + "Z" if r.muted_until else None,
                "joined_at": r.joined_at.isoformat() + "Z",
                "permissions": sorted(_resolve_permissions(r.role or "member", r.permissions)),
            } for r in rows], key=lambda x: -ROLE_RANK.get(x["role"], 1))
        ch = (await db.execute(select(Channel).where(Channel.id == target_id))).scalar_one_or_none()
        if not ch:
            return []
        rows = (await db.execute(select(ChannelSubscriber).where(ChannelSubscriber.channel_id == target_id)
            .options(selectinload(ChannelSubscriber.user)))).scalars().all()
        result = []
        seen = set()
        for r in rows:
            seen.add(r.user_id)
            role = "owner" if r.user_id == ch.owner_id else (r.role or "subscriber")
            result.append({
                "user_id": r.user_id, "display_name": r.user.display_name, "username": r.user.username,
                "avatar_url": r.user.avatar_url, "is_online": r.user.is_online,
                "role": role, "muted_until": r.muted_until.isoformat() + "Z" if r.muted_until else None,
                "joined_at": r.created_at.isoformat() + "Z",
                "permissions": sorted(_resolve_permissions(role, r.permissions)),
            })
        if ch.owner_id not in seen:
            owner = (await db.execute(select(User).where(User.id == ch.owner_id))).scalar_one_or_none()
            if owner:
                result.append({
                    "user_id": owner.id, "display_name": owner.display_name, "username": owner.username,
                    "avatar_url": owner.avatar_url, "is_online": owner.is_online,
                    "role": "owner", "muted_until": None, "joined_at": ch.created_at.isoformat() + "Z",
                    "permissions": sorted(ALL_PERMISSIONS),
                })
        return sorted(result, key=lambda x: -ROLE_RANK.get(x["role"], 1))

    @staticmethod
    async def list_admins(db, kind: str, target_id: int):
        members = await MembershipService.list_members(db, kind, target_id)
        return [m for m in members if m["role"] in ("owner", "admin")]

    @staticmethod
    async def get_permissions(db, kind: str, target_id: int, user_id: int) -> set:
        role = await MembershipService.get_role(db, kind, target_id, user_id)
        if not role:
            return set()
        if kind == "chat":
            m = (await db.execute(select(ChatMember).where(and_(
                ChatMember.chat_id == target_id, ChatMember.user_id == user_id
            )))).scalar_one_or_none()
            raw = m.permissions if m else None
        else:
            s = (await db.execute(select(ChannelSubscriber).where(and_(
                ChannelSubscriber.channel_id == target_id, ChannelSubscriber.user_id == user_id
            )))).scalar_one_or_none()
            raw = s.permissions if s else None
        return _resolve_permissions(role, raw)

    @staticmethod
    async def has_permission(db, kind: str, target_id: int, user_id: int, perm: str) -> bool:
        perms = await MembershipService.get_permissions(db, kind, target_id, user_id)
        return perm in perms

    @staticmethod
    async def set_permissions(db, kind: str, target_id: int, user_id: int, perms: set) -> bool:
        csv = ",".join(sorted(p for p in perms if p in ALL_PERMISSIONS))
        if kind == "chat":
            m = (await db.execute(select(ChatMember).where(and_(
                ChatMember.chat_id == target_id, ChatMember.user_id == user_id
            )))).scalar_one_or_none()
            if not m or m.role != "admin":
                return False
            m.permissions = csv
        else:
            s = (await db.execute(select(ChannelSubscriber).where(and_(
                ChannelSubscriber.channel_id == target_id, ChannelSubscriber.user_id == user_id
            )))).scalar_one_or_none()
            if not s or s.role != "admin":
                return False
            s.permissions = csv
            chat = (await db.execute(select(Chat).where(Chat.channel_id == target_id))).scalar_one_or_none()
            if chat:
                cm = (await db.execute(select(ChatMember).where(and_(
                    ChatMember.chat_id == chat.id, ChatMember.user_id == user_id
                )))).scalar_one_or_none()
                if cm:
                    cm.permissions = csv
        await db.commit()
        return True

    @staticmethod
    async def set_role(db, kind: str, target_id: int, user_id: int, new_role: str, actor_id: int = None):
        if kind == "chat":
            m = (await db.execute(select(ChatMember).where(and_(
                ChatMember.chat_id == target_id, ChatMember.user_id == user_id
            )))).scalar_one_or_none()
            if not m:
                return False
            m.role = new_role
            m.is_admin = new_role in ("owner", "admin")
        else:
            s = (await db.execute(select(ChannelSubscriber).where(and_(
                ChannelSubscriber.channel_id == target_id, ChannelSubscriber.user_id == user_id
            )))).scalar_one_or_none()
            if not s:
                return False
            s.role = new_role
            # Mirror onto the shared discussion chat so its ChatMember.role stays in
            # sync (that table uses "member" instead of "subscriber" for non-admins).
            chat_role = "member" if new_role == "subscriber" else new_role
            chat = (await db.execute(select(Chat).where(Chat.channel_id == target_id))).scalar_one_or_none()
            if chat:
                cm = (await db.execute(select(ChatMember).where(and_(
                    ChatMember.chat_id == chat.id, ChatMember.user_id == user_id
                )))).scalar_one_or_none()
                if cm:
                    cm.role = chat_role
                    cm.is_admin = chat_role in ("owner", "admin")
        await db.commit()
        if actor_id:
            await MembershipService.log_action(db, kind, target_id, actor_id, "role_change",
                target_user_id=user_id, details=new_role)
        return True

    # ---- kick / ban -------------------------------------------------------

    @staticmethod
    async def remove_member(db, kind: str, target_id: int, user_id: int, actor_id: int = None):
        if kind == "chat":
            await ChatService.remove_chat_member(db, target_id, user_id)
            await db.commit()
        else:
            s = (await db.execute(select(ChannelSubscriber).where(and_(
                ChannelSubscriber.channel_id == target_id, ChannelSubscriber.user_id == user_id
            )))).scalar_one_or_none()
            if s:
                await db.delete(s)
                ch = (await db.execute(select(Channel).where(Channel.id == target_id))).scalar_one_or_none()
                if ch and ch.subscribers_count > 0:
                    ch.subscribers_count -= 1
                chat = (await db.execute(select(Chat).where(Chat.channel_id == target_id))).scalar_one_or_none()
                if chat:
                    await ChatService.remove_chat_member(db, chat.id, user_id)
            await db.commit()
        if actor_id:
            await MembershipService.log_action(db, kind, target_id, actor_id, "kick", target_user_id=user_id)

    @staticmethod
    async def ban_member(db, kind: str, target_id: int, user_id: int, banned_by_id: int, reason: str = None):
        await MembershipService.remove_member(db, kind, target_id, user_id)
        existing = (await db.execute(select(Ban).where(and_(
            Ban.kind == kind, Ban.target_id == target_id, Ban.user_id == user_id
        )))).scalar_one_or_none()
        if not existing:
            db.add(Ban(kind=kind, target_id=target_id, user_id=user_id, banned_by_id=banned_by_id, reason=reason))
            await db.commit()
        await MembershipService.log_action(db, kind, target_id, banned_by_id, "ban",
            target_user_id=user_id, details=reason)

    @staticmethod
    async def unban_member(db, kind: str, target_id: int, user_id: int, actor_id: int = None):
        await db.execute(delete(Ban).where(and_(
            Ban.kind == kind, Ban.target_id == target_id, Ban.user_id == user_id
        )))
        await db.commit()
        if actor_id:
            await MembershipService.log_action(db, kind, target_id, actor_id, "unban", target_user_id=user_id)

    @staticmethod
    async def is_banned(db, kind: str, target_id: int, user_id: int) -> bool:
        b = (await db.execute(select(Ban).where(and_(
            Ban.kind == kind, Ban.target_id == target_id, Ban.user_id == user_id
        )))).scalar_one_or_none()
        return b is not None

    @staticmethod
    async def list_bans(db, kind: str, target_id: int):
        rows = (await db.execute(select(Ban).where(and_(
            Ban.kind == kind, Ban.target_id == target_id
        )))).scalars().all()
        result = []
        for b in rows:
            u = (await db.execute(select(User).where(User.id == b.user_id))).scalar_one_or_none()
            result.append({
                "user_id": b.user_id, "display_name": u.display_name if u else "?",
                "avatar_url": u.avatar_url if u else None, "reason": b.reason,
                "banned_at": b.created_at.isoformat() + "Z",
            })
        return result

    # ---- mute ---------------------------------------------------------------

    @staticmethod
    async def mute_member(db, kind: str, target_id: int, user_id: int, until: datetime, actor_id: int = None):
        if kind == "chat":
            m = (await db.execute(select(ChatMember).where(and_(
                ChatMember.chat_id == target_id, ChatMember.user_id == user_id
            )))).scalar_one_or_none()
            if not m:
                return False
            m.muted_until = until
        else:
            s = (await db.execute(select(ChannelSubscriber).where(and_(
                ChannelSubscriber.channel_id == target_id, ChannelSubscriber.user_id == user_id
            )))).scalar_one_or_none()
            if not s:
                return False
            s.muted_until = until
            # Mirror onto the shared discussion chat so the existing message-send
            # mute check (chats.py) also blocks comments, without duplicating logic.
            chat = (await db.execute(select(Chat).where(Chat.channel_id == target_id))).scalar_one_or_none()
            if chat:
                cm = (await db.execute(select(ChatMember).where(and_(
                    ChatMember.chat_id == chat.id, ChatMember.user_id == user_id
                )))).scalar_one_or_none()
                if cm:
                    cm.muted_until = until
        await db.commit()
        if actor_id and until is not None:
            await MembershipService.log_action(db, kind, target_id, actor_id, "mute",
                target_user_id=user_id, details=until.isoformat())
        return True

    @staticmethod
    async def unmute_member(db, kind: str, target_id: int, user_id: int, actor_id: int = None):
        await MembershipService.mute_member(db, kind, target_id, user_id, None)
        if actor_id:
            await MembershipService.log_action(db, kind, target_id, actor_id, "unmute", target_user_id=user_id)

    @staticmethod
    async def is_muted(db, kind: str, target_id: int, user_id: int) -> bool:
        role_obj = None
        if kind == "chat":
            role_obj = (await db.execute(select(ChatMember).where(and_(
                ChatMember.chat_id == target_id, ChatMember.user_id == user_id
            )))).scalar_one_or_none()
        else:
            role_obj = (await db.execute(select(ChannelSubscriber).where(and_(
                ChannelSubscriber.channel_id == target_id, ChannelSubscriber.user_id == user_id
            )))).scalar_one_or_none()
        return bool(role_obj and role_obj.muted_until and role_obj.muted_until > datetime.utcnow())

    # ---- invite links ---------------------------------------------------------

    @staticmethod
    def format_invite(link: InviteLink) -> dict:
        return {"id": link.id, "code": link.code, "created_at": link.created_at.isoformat() + "Z",
            "expires_at": link.expires_at.isoformat() + "Z" if link.expires_at else None,
            "max_uses": link.max_uses, "uses_count": link.uses_count}

    @staticmethod
    def _generate_code() -> str:
        return secrets.token_urlsafe(8).replace("_", "").replace("-", "")[:10]

    @staticmethod
    async def create_invite_link(db, kind: str, target_id: int, created_by_id: int, expires_at=None, max_uses=None):
        code = MembershipService._generate_code()
        link = InviteLink(kind=kind, target_id=target_id, code=code, created_by_id=created_by_id,
            expires_at=expires_at, max_uses=max_uses)
        db.add(link)
        await db.commit()
        await db.refresh(link)
        return link

    @staticmethod
    async def list_invite_links(db, kind: str, target_id: int):
        rows = (await db.execute(select(InviteLink).where(and_(
            InviteLink.kind == kind, InviteLink.target_id == target_id, InviteLink.revoked == False
        )).order_by(InviteLink.created_at.desc()))).scalars().all()
        return rows

    @staticmethod
    async def revoke_invite_link(db, kind: str, target_id: int, link_id: int):
        link = (await db.execute(select(InviteLink).where(and_(
            InviteLink.id == link_id, InviteLink.kind == kind, InviteLink.target_id == target_id
        )))).scalar_one_or_none()
        if link:
            link.revoked = True
            await db.commit()
        return link is not None

    @staticmethod
    async def resolve_and_join(db, code: str, user_id: int):
        link = (await db.execute(select(InviteLink).where(InviteLink.code == code))).scalar_one_or_none()
        if not link or link.revoked:
            raise InviteError("Ссылка недействительна", 404)
        if link.expires_at and link.expires_at < datetime.utcnow():
            raise InviteError("Срок действия ссылки истёк", 410)
        if link.max_uses is not None and link.uses_count >= link.max_uses:
            raise InviteError("Лимит использований ссылки исчерпан", 410)
        if await MembershipService.is_banned(db, link.kind, link.target_id, user_id):
            raise InviteError("Вы заблокированы в этом сообществе", 403)

        if link.kind == "chat":
            chat = (await db.execute(select(Chat).where(Chat.id == link.target_id))).scalar_one_or_none()
            if not chat:
                raise InviteError("Группа не найдена", 404)
            await ChatService.ensure_chat_member(db, chat.id, user_id)
            link.uses_count += 1
            await db.commit()
            return {"kind": "chat", "id": chat.id, "name": chat.name}

        ch = (await db.execute(select(Channel).where(Channel.id == link.target_id))).scalar_one_or_none()
        if not ch:
            raise InviteError("Канал не найден", 404)
        existing = (await db.execute(select(ChannelSubscriber).where(and_(
            ChannelSubscriber.channel_id == ch.id, ChannelSubscriber.user_id == user_id
        )))).scalar_one_or_none()
        if not existing:
            db.add(ChannelSubscriber(channel_id=ch.id, user_id=user_id))
            ch.subscribers_count += 1
            await ChatService.get_or_create_channel_chat(db, ch, user_id)
        link.uses_count += 1
        await db.commit()
        return {"kind": "channel", "id": ch.id, "name": ch.name}

    # ---- audit log ------------------------------------------------------------

    @staticmethod
    async def log_action(db, kind: str, target_id: int, actor_id: int, action: str,
            target_user_id: int = None, details: str = None):
        db.add(AuditLogEntry(kind=kind, target_id=target_id, actor_id=actor_id, action=action,
            target_user_id=target_user_id, details=details))
        await db.commit()

    @staticmethod
    async def list_audit_log(db, kind: str, target_id: int, limit: int = 100):
        rows = (await db.execute(select(AuditLogEntry).where(and_(
            AuditLogEntry.kind == kind, AuditLogEntry.target_id == target_id
        )).order_by(AuditLogEntry.created_at.desc()).limit(limit))).scalars().all()
        result = []
        for r in rows:
            actor = (await db.execute(select(User).where(User.id == r.actor_id))).scalar_one_or_none()
            target = (await db.execute(select(User).where(User.id == r.target_user_id))).scalar_one_or_none() \
                if r.target_user_id else None
            result.append({
                "action": r.action, "details": r.details,
                "actor_name": actor.display_name if actor else "?",
                "target_name": target.display_name if target else None,
                "created_at": r.created_at.isoformat() + "Z",
            })
        return result
