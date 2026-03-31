export type InsertOperation = {
  type: "insert";
  site_id: string;
  counter: number;
  value: string;
  index: number;
};

export type DeleteOperation = {
  type: "delete";
  site_id: string;
  counter: number;
};

export type Operation = InsertOperation | DeleteOperation;

export type CharacterJSON = {
  id: [site_id: string, counter: number];
  value: string;
  tombstone: boolean;
};

export type DocumentJSON = {
  characters: CharacterJSON[];
};

type StateMessage = {
  type: "state";
  document: DocumentJSON;
};

type IncomingMessage = StateMessage | Operation | { type: "error"; error?: string };

export class CollabSocket {
  readonly room_id: string;
  readonly site_id: string;

  onStateSync?: (doc: DocumentJSON) => void;
  onOperation?: (op: Operation) => void;
  onConnect?: () => void;

  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private shouldReconnect = true;
  private pendingSends: string[] = [];

  constructor(room_id: string, site_id: string) {
    this.room_id = room_id;
    this.site_id = site_id;
    this.connect();
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      try {
        this.ws.close();
      } catch {
        // ignore
      }
    }
    this.ws = null;
  }

  sendOperation(op: Operation) {
    const payload = JSON.stringify(op);
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.pendingSends.push(payload);
      return;
    }
    this.ws.send(payload);
  }

  private connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const url = `ws://localhost:8000/ws/${encodeURIComponent(this.room_id)}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.onConnect?.();
      while (this.pendingSends.length > 0 && ws.readyState === WebSocket.OPEN) {
        const msg = this.pendingSends.shift();
        if (msg) ws.send(msg);
      }
    };

    ws.onmessage = (ev: MessageEvent<string>) => {
      let parsed: IncomingMessage;
      try {
        parsed = JSON.parse(ev.data) as IncomingMessage;
      } catch {
        return;
      }

      if (parsed.type === "state") {
        this.onStateSync?.(parsed.document);
        return;
      }

      if (parsed.type === "insert" || parsed.type === "delete") {
        this.onOperation?.(parsed);
      }
    };

    const scheduleReconnect = () => {
      if (!this.shouldReconnect) return;
      if (this.reconnectTimer !== null) return;
      this.reconnectTimer = window.setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, 2000);
    };

    ws.onclose = scheduleReconnect;
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        // ignore
      }
      scheduleReconnect();
    };
  }
}

