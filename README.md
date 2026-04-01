# Nexus

**Nexus** is a real-time collaborative code editor: multiple people can edit the same document together with conflict-free merging, live presence, and minimal setup.

**Live demo:** [nexus-rose-mu.vercel.app](https://nexus-rose-mu.vercel.app)

---

## What is this?

Nexus lets you open a shared “room,” pick a username, and edit code in the browser as if you were in the same file. Changes from everyone are merged safely, cursors and selections are visible, and the app keeps working even when the network blips—operations queue and reconnect automatically.

---

## Key features

- **CRDT-based conflict-free editing** — concurrent edits merge without manual “who wins” resolution.
- **Real-time WebSocket sync** — inserts, deletes, and presence updates propagate instantly.
- **Live color-coded cursors** — see where collaborators are in the document.
- **Selection highlighting** — remote selections are shown with per-user colors.
- **Room-based collaboration** — join a room ID to share one document with your team.
- **Automatic reconnection** — if the socket drops, the client reconnects and replays pending work.

---

## How it works

Traditional editing assumes one writer at a time. With many people typing at once, you need a rule for combining changes.

**CRDTs (Conflict-free Replicated Data Types)** are data structures designed for exactly that. Each character in the document has a stable identity (here, a **site ID** plus a **counter**). When two people insert or delete at the same time, the system applies operations in a way that every replica ends up with the same final text—without a central “merge editor” step.

Deletes are handled with **tombstones** (characters marked removed but still known to the model), which keeps history consistent when messages arrive out of order. The result is a sequence model that stays in sync across browsers as long as everyone eventually receives the same operations.

---

## Tech stack

### Frontend

- **React** + **TypeScript**
- **Vite**
- **Monaco Editor** (`@monaco-editor/react`) — editor UI, decorations for remote cursors/selections, and layout-aware overlays
- **WebSockets** — `CollabSocket` client with reconnect and a pending-operation queue

### Backend

- **Python** + **FastAPI**
- **Uvicorn**
- **WebSockets** — rooms, broadcast to peers, health check
- **Custom sequence CRDT** — document state stored as a list of characters with IDs and tombstones (`crdt.py`), rooms in `room.py`, API in `main.py`

---

## Run locally

Prerequisites: **Node.js** (for the frontend) and **Python 3.10+** (for the backend).

### Backend

From the **repository root** (where `main.py` lives):

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The API serves a health check at `GET /health` and WebSockets at `ws://localhost:8000/ws/{room_id}`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`), enter a room ID and username, and join.

**WebSocket URL:** the client’s WebSocket endpoint is set in `frontend/src/socket.ts`. For local development against the backend above, point it at `ws://localhost:8000/ws/...` (or use `wss://` when testing HTTPS). For the hosted demo, it may target your deployed API instead.
