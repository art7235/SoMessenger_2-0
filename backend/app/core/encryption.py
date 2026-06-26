import base64
import hashlib
from functools import lru_cache
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

ENCRYPTION_PREFIX = "enc:v1:"


def is_encrypted(value: Optional[str]) -> bool:
    return isinstance(value, str) and value.startswith(ENCRYPTION_PREFIX)


@lru_cache(maxsize=1)
def _get_fernet() -> Fernet:
    """Return the application at-rest encryption cipher.

    Prefer MESSAGE_ENCRYPTION_KEY from .env. It must be a Fernet key generated with:
        python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

    For local development/backward compatibility we derive a key from SECRET_KEY if
    MESSAGE_ENCRYPTION_KEY is absent. In production set MESSAGE_ENCRYPTION_KEY and
    never rotate it without re-encrypting existing data.
    """
    key = (getattr(settings, "MESSAGE_ENCRYPTION_KEY", "") or "").strip()
    if key:
        return Fernet(key.encode())

    digest = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_text(value: Optional[str]) -> Optional[str]:
    if value is None or value == "" or is_encrypted(value):
        return value
    token = _get_fernet().encrypt(value.encode("utf-8")).decode("utf-8")
    return ENCRYPTION_PREFIX + token


def decrypt_text(value: Optional[str]) -> Optional[str]:
    if value is None or value == "" or not is_encrypted(value):
        return value
    token = value[len(ENCRYPTION_PREFIX):]
    try:
        return _get_fernet().decrypt(token.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError):
        # Do not crash the UI if a wrong key was configured; return a clear marker.
        return "[не удалось расшифровать сообщение]"
