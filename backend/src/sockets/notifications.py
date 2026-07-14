from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, List
import json
import asyncio

class ConnectionManager:
    """Manejo de conexiones WebSocket"""
    
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.user_connections: Dict[str, str] = {}  # websocket_id -> user_id
    
    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        self.user_connections[str(id(websocket))] = user_id
        print(f"WebSocket conectado: {user_id}")
    
    def disconnect(self, websocket: WebSocket):
        ws_id = str(id(websocket))
        user_id = self.user_connections.get(ws_id)
        if user_id and user_id in self.active_connections:
            self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        if ws_id in self.user_connections:
            del self.user_connections[ws_id]
        print(f"WebSocket desconectado: {user_id}")
    
    async def send_personal_message(self, message: dict, user_id: str):
        """Enviar mensaje a un usuario específico"""
        if user_id in self.active_connections:
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_text(json.dumps(message))
                except:
                    pass
    
    async def broadcast(self, message: dict):
        """Enviar mensaje a todos los usuarios conectados"""
        for user_id in self.active_connections:
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_text(json.dumps(message))
                except:
                    pass
    
    async def send_notification(self, user_id: str, title: str, body: str, data: dict = None):
        """Enviar notificación push"""
        message = {
            "type": "notification",
            "title": title,
            "body": body,
            "data": data or {},
            "timestamp": __import__("datetime").datetime.now().isoformat()
        }
        await self.send_personal_message(message, user_id)

manager = ConnectionManager()
