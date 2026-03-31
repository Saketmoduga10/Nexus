from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Set

from crdt import Document


@dataclass
class Room:
    room_id: str
    document: Document = field(default_factory=Document)
    clients: Set[Any] = field(default_factory=set)

    def add_client(self, websocket: Any) -> None:
        self.clients.add(websocket)

    def remove_client(self, websocket: Any) -> None:
        self.clients.discard(websocket)

    async def broadcast(self, message: Any, exclude: Optional[Any] = None) -> None:
        clients = [ws for ws in self.clients if ws is not exclude]
        if not clients:
            return

        async def _safe_send(ws: Any) -> None:
            try:
                if isinstance(message, str):
                    await ws.send_text(message)
                else:
                    await ws.send_json(message)
            except Exception:
                self.clients.discard(ws)

        await asyncio.gather(*(_safe_send(ws) for ws in clients), return_exceptions=True)

    def get_state(self) -> str:
        return self.document.to_json()


@dataclass
class RoomManager:
    rooms: Dict[str, Room] = field(default_factory=dict)

    def get_or_create(self, room_id: str) -> Room:
        room = self.rooms.get(room_id)
        if room is None:
            room = Room(room_id=room_id)
            self.rooms[room_id] = room
        return room

    def remove_client(self, room_id: str, websocket: Any) -> None:
        room = self.rooms.get(room_id)
        if room is None:
            return
        room.remove_client(websocket)
        if not room.clients:
            self.rooms.pop(room_id, None)

