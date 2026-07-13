import firebase_admin
from firebase_admin import credentials, messaging
from app.core.config import settings
import os

firebase_app = None

def init_firebase():
    global firebase_app
    key_path = os.path.join(settings.BASE_DIR, "backend", settings.FIREBASE_KEY_PATH)
    if os.path.exists(key_path):
        cred = credentials.Certificate(key_path)
        firebase_app = firebase_admin.initialize_app(cred)
        print("✅ Firebase initialized")
    else:
        print(f"⚠️ Firebase key not found at {key_path}. Push notifications disabled.")

async def send_push_notification(token, title, body, data=None):
    if not firebase_app or not token:
        return
    
    try:
        message = messaging.Message(
            notification=messaging.Notification(
                title=title,
                body=body,
            ),
            data=data or {},
            token=token,
        )
        messaging.send(message)
    except Exception as e:
        print(f"⚠️ FCM Error: {e}")
