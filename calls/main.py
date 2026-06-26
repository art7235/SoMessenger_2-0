from fastapi import FastAPI, WebSocket, Query
from .auth import verify_token
from .signaling import handle_signaling

app = FastAPI()

@app.get("/api/call/ice-servers")
async def get_ice():
    return {"iceServers": [
        {"urls": ["stun:stun.l.google.com:19302"]},
        {"urls": ["stun:195.58.34.10:3478"]},
        {"urls": ["turn:195.58.34.10:3478"], "username": "somessenger", "credential": "SoMessengerTurn2026"}
    ]}

@app.websocket("/ws/call")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(None)):
    user_id = verify_token(token) if token else None
    if user_id is None:
        await websocket.close(code=1008)
    else:
        await handle_signaling(user_id, websocket)
