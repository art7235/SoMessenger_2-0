from pydantic_settings import BaseSettings
import os

class Settings(BaseSettings):
    SECRET_KEY: str = "somessenger_super_secret_key_2024"
    MESSAGE_ENCRYPTION_KEY: str = ""
    DATABASE_URL: str = "sqlite+aiosqlite:///./somessenger.db"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 43200
    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    UPLOAD_DIR: str = os.path.join(BASE_DIR, "uploads")
    MAX_FILE_SIZE: int = 52428800
    ENVIRONMENT: str = "development"
    CORS_ORIGINS: str = ""
    DEFAULT_ADMIN_USERNAME: str = "admin"
    DEFAULT_ADMIN_EMAIL: str = "admin@so.me"
    DEFAULT_ADMIN_DISPLAY_NAME: str = "Admin"
    DEFAULT_ADMIN_PASSWORD: str = "admin123"
    DEFAULT_CHANNEL_NAME: str = "SoMessenger"
    DEFAULT_CHANNEL_USERNAME: str = "somessenger"
    DEFAULT_CHANNEL_DESCRIPTION: str = "Официальные новости SoMessenger"
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = "m91730405@gmail.com"
    SMTP_PASSWORD: str = ""
    DONATION_ALERTS_URL: str = "https://dalink.to/somessenger"
    ALGORITHM: str = "HS256"

    # Secret token for admin panel.
    # Access only via https://.../admin/YOUR_TOKEN
    # Generate: python3 -c "import secrets; print(secrets.token_urlsafe(32))"
    ADMIN_PANEL_TOKEN: str = ""

    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()
