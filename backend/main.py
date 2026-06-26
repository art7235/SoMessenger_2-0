from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from app.core.database import create_tables
from app.api.routes import auth, users, chats, channels, stickers, ws, admin
from app.core.config import settings
import os, time
from collections import defaultdict, deque

app = FastAPI(title="SoMessenger API", version="5.0.0")

def _cors_origins():
    origins = [o.strip() for o in (settings.CORS_ORIGINS or "").split(",") if o.strip()]
    if origins:
        return origins
    return ["*"] if settings.ENVIRONMENT != "production" else []

app.add_middleware(CORSMiddleware, allow_origins=_cors_origins(), allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# Simple in-memory rate limiting. It is intentionally dependency-free and works
# well for one app process. For multi-worker production deployments replace it
# with Redis/nginx rate limiting.
_rate_buckets = defaultdict(deque)

def _client_ip(request: Request):
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

@app.middleware("http")
async def security_and_rate_limit(request: Request, call_next):
    if request.url.path.startswith("/api/"):
        now = time.time()
        is_auth = request.url.path.startswith("/api/auth/")
        limit, window = (12, 60) if is_auth else (420, 60)
        key = ("auth" if is_auth else "api", _client_ip(request))
        bucket = _rate_buckets[key]
        while bucket and bucket[0] < now - window:
            bucket.popleft()
        if len(bucket) >= limit:
            return JSONResponse({"detail":"Слишком много запросов. Попробуйте позже."}, status_code=429)
        bucket.append(now)

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(self), microphone=(self), geolocation=(), payment=()"
    if settings.ENVIRONMENT == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response
app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(chats.router, prefix="/api")
app.include_router(channels.router, prefix="/api")
app.include_router(stickers.router, prefix="/api")
app.include_router(ws.router)
app.include_router(admin.router)  # Admin panel at /admin/{token} (no /api prefix!)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
frontend_dir = os.path.join(BASE_DIR, "frontend")
fr_static = os.path.join(frontend_dir, "static")

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
for sub in ["media","voice","files","avatars"]:
    os.makedirs(os.path.join(settings.UPLOAD_DIR, sub), exist_ok=True)

app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")
if os.path.exists(fr_static):
    app.mount("/static", StaticFiles(directory=fr_static), name="static")

@app.get("/")
async def index():
    p = os.path.join(frontend_dir, "index.html")
    return FileResponse(p) if os.path.exists(p) else JSONResponse({"message":"Фронтенд не найден"})

@app.get("/api/health")
async def health(): return {"status":"ok"}

@app.get("/{path:path}")
async def spa(path: str):
    if path.startswith("api/") or path.startswith("ws"):
        return JSONResponse({"detail":"Not found"}, status_code=404)
    fp = os.path.join(frontend_dir, path)
    if os.path.exists(fp) and os.path.isfile(fp): return FileResponse(fp)
    ip = os.path.join(frontend_dir, "index.html")
    if os.path.exists(ip): return FileResponse(ip)
    return JSONResponse({"detail":"Not found"}, status_code=404)

@app.on_event("startup")
async def startup():
    if settings.ENVIRONMENT == "production":
        if not settings.MESSAGE_ENCRYPTION_KEY:
            print("⚠️  MESSAGE_ENCRYPTION_KEY не задан: используется ключ, производный от SECRET_KEY. Лучше задать отдельный стабильный ключ.")
        if settings.SECRET_KEY == "somessenger_super_secret_key_2024":
            print("⚠️  SECRET_KEY стандартный. В production обязательно замените его в .env")
        if settings.DEFAULT_ADMIN_PASSWORD == "admin123":
            print("⚠️  DEFAULT_ADMIN_PASSWORD стандартный. В production обязательно замените его в .env")
    await create_tables()
    print(f"✅ SoMessenger v5 запущен! http://localhost:8000")