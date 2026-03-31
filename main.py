from __future__ import annotations

import json
from typing import Any, Dict

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from crdt import Document
from room import Room, RoomManager


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

room_manager = RoomManager()


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.websocket("/ws/{room_id}")
async def ws_room(websocket: WebSocket, room_id: str) -> None:
    await websocket.accept()

    room = room_manager.get_or_create(room_id)
    room.add_client(websocket)

    await websocket.send_text(
        json.dumps(
            {"type": "state", "document": json.loads(room.get_state())},
            separators=(",", ":"),
            ensure_ascii=False,
        )
    )

    try:
        while True:
            raw = await websocket.receive_text()
            message: Dict[str, Any] = json.loads(raw)
            msg_type = message.get("type")

            if msg_type == "insert":
                room.document.insert(
                    site_id=message["site_id"],
                    counter=message["counter"],
                    value=message["value"],
                    index=message["index"],
                )
                await room.broadcast(raw, exclude=websocket)
            elif msg_type == "delete":
                room.document.delete(
                    site_id=message["site_id"],
                    counter=message["counter"],
                )
                await room.broadcast(raw, exclude=websocket)
            else:
                await websocket.send_text(
                    json.dumps(
                        {"type": "error", "error": "unknown message type"},
                        separators=(",", ":"),
                        ensure_ascii=False,
                    )
                )
    except WebSocketDisconnect:
        room_manager.remove_client(room_id, websocket)

