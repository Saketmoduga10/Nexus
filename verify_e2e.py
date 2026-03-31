from __future__ import annotations

import asyncio
import json
from typing import Any, Dict

import uvicorn
import websockets

import main


async def _start_server(host: str, port: int) -> tuple[uvicorn.Server, asyncio.Task[None]]:
    config = uvicorn.Config(
        main.app,
        host=host,
        port=port,
        log_level="warning",
        lifespan="off",
    )
    server = uvicorn.Server(config)

    serve_task: asyncio.Task[None] = asyncio.create_task(server.serve())
    for _ in range(200):
        if server.started:
            return server, serve_task
        await asyncio.sleep(0.01)
    raise RuntimeError("server failed to start")


async def main_async() -> None:
    host = "127.0.0.1"
    port = 8765
    room_id = "room1"
    ws_url = f"ws://{host}:{port}/ws/{room_id}"

    server, serve_task = await _start_server(host, port)

    async with websockets.connect(ws_url) as ws1, websockets.connect(ws_url) as ws2:
        state1 = json.loads(await ws1.recv())
        state2 = json.loads(await ws2.recv())
        assert state1["type"] == "state"
        assert state2["type"] == "state"

        insert_msg: Dict[str, Any] = {
            "type": "insert",
            "site_id": "A",
            "counter": 1,
            "value": "H",
            "index": 0,
        }
        await ws1.send(json.dumps(insert_msg, separators=(",", ":"), ensure_ascii=False))
        got = json.loads(await ws2.recv())
        assert got == insert_msg

        delete_msg: Dict[str, Any] = {
            "type": "delete",
            "site_id": "A",
            "counter": 1,
        }
        await ws2.send(json.dumps(delete_msg, separators=(",", ":"), ensure_ascii=False))
        got2 = json.loads(await ws1.recv())
        assert got2 == delete_msg

    async with websockets.connect(ws_url) as ws3:
        state3 = json.loads(await ws3.recv())
        assert state3["type"] == "state"
        visible = "".join(
            ch["value"]
            for ch in state3["document"]["characters"]
            if (not ch["tombstone"] and ch["value"])
        )
        assert visible == ""

    server.should_exit = True
    await asyncio.wait_for(serve_task, timeout=5)


if __name__ == "__main__":
    asyncio.run(main_async())

