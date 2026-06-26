from fastapi import WebSocket
from typing import Dict, List
import json

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = {}
    async def connect(self, ws: WebSocket, user_id: int):
        await ws.accept()
        if user_id not in self.active_connections: self.active_connections[user_id] = []
        self.active_connections[user_id].append(ws)
    def disconnect(self, ws: WebSocket, user_id: int):
        if user_id in self.active_connections:
            if ws in self.active_connections[user_id]: self.active_connections[user_id].remove(ws)
            if not self.active_connections[user_id]: del self.active_connections[user_id]
    async def send_to_user(self, user_id: int, data: dict):
        if user_id in self.active_connections:
            msg = json.dumps(data, ensure_ascii=False, default=str)
            dead = []
            for ws in self.active_connections[user_id]:
                try: await ws.send_text(msg)
                except: dead.append(ws)
            for ws in dead: self.active_connections[user_id].remove(ws)
    async def broadcast_to_chat_members(self, member_ids: List[int], data: dict):
        for uid in member_ids:
            await self.send_to_user(uid, data)
    def get_online_users(self) -> List[int]:
        return list(self.active_connections.keys())

manager = ConnectionManager()
