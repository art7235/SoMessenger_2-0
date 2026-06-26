from typing import Dict, List
from fastapi import WebSocket
import json

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, WebSocket] = {}
        self.pending_messages: Dict[int, List[dict]] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        print(f"📞 User {user_id} connected. Online: {list(self.active_connections.keys())}")
        if user_id in self.pending_messages:
            for msg in self.pending_messages[user_id]:
                print(f"📞 Sending buffered {msg.get('type')} to {user_id}")
                try:
                    await websocket.send_json(msg)
                except Exception as e:
                    print(f"📞 Error sending buffered: {e}")
            del self.pending_messages[user_id]

    def disconnect(self, user_id: int):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
        print(f"📞 User {user_id} disconnected. Online: {list(self.active_connections.keys())}")

    async def send_message(self, message: dict, user_id: int):
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].send_json(message)
                print(f"📞 Sent {message.get('type')} to {user_id} (online)")
                return True
            except Exception as e:
                print(f"📞 Error sending to {user_id}: {e}")
                return False
        else:
            if user_id not in self.pending_messages:
                self.pending_messages[user_id] = []
            self.pending_messages[user_id].append(message)
            print(f"📞 Buffered {message.get('type')} for {user_id} (offline). Buffer size: {len(self.pending_messages[user_id])}")
            return True

manager = ConnectionManager()

async def handle_signaling(user_id: int, websocket: WebSocket):
    await manager.connect(user_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            print(f"📞 Received {msg.get('type')} from {user_id} to {msg.get('to_user_id')}")
            msg["from_user_id"] = user_id
            target = msg.get("to_user_id")
            if target:
                if msg["type"] == "call_offer":
                    msg["type"] = "incoming_call"
                elif msg["type"] == "call_answer":
                    msg["type"] = "call_answered"
                await manager.send_message(msg, target)
    except:
        pass
    finally:
        manager.disconnect(user_id)
