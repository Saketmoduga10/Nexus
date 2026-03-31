import { useEffect, useRef, useState } from "react";
import MonacoEditor from "@monaco-editor/react";
import type { CharacterJSON, CursorOperation, DocumentJSON, Operation } from "./socket";
import { CollabSocket } from "./socket";
import { Cursors } from "./Cursors";

type EditorProps = {
  room_id: string;
  site_id: string;
};

function visibleTextFromChars(chars: CharacterJSON[]): string {
  return chars.filter((c) => !c.tombstone && c.value).map((c) => c.value).join("");
}

function listIndexForVisibleIndex(chars: CharacterJSON[], visibleIndex: number): number {
  if (visibleIndex <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i].tombstone) continue;
    if (seen === visibleIndex) return i;
    seen += 1;
  }
  return chars.length;
}

function charAtVisibleIndex(chars: CharacterJSON[], visibleIndex: number): CharacterJSON | null {
  if (visibleIndex < 0) return null;
  let seen = 0;
  for (const ch of chars) {
    if (ch.tombstone) continue;
    if (seen === visibleIndex) return ch;
    seen += 1;
  }
  return null;
}

function findDiff(oldText: string, newText: string): { index: number; removed: string; added: string } {
  if (oldText === newText) return { index: 0, removed: "", added: "" };

  let start = 0;
  const oldLen = oldText.length;
  const newLen = newText.length;
  while (start < oldLen && start < newLen && oldText[start] === newText[start]) start += 1;

  let oldEnd = oldLen;
  let newEnd = newLen;
  while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) {
    oldEnd -= 1;
    newEnd -= 1;
  }

  return {
    index: start,
    removed: oldText.slice(start, oldEnd),
    added: newText.slice(start, newEnd),
  };
}

function lineIndexFromOffset(text: string, offset: number): number {
  const clamped = Math.max(0, Math.min(offset, text.length));
  let line = 0;
  for (let i = 0; i < clamped; i++) if (text[i] === "\n") line += 1;
  return line;
}

export function Editor({ room_id, site_id }: EditorProps) {
  const [value, setValue] = useState<string>("");
  const [remoteCursors, setRemoteCursors] = useState<Record<string, number>>({});

  const socketRef = useRef<CollabSocket | null>(null);
  const counterRef = useRef<number>(0);
  const prevContentRef = useRef<string>("");
  const applyingRemoteRef = useRef<boolean>(false);
  const charsRef = useRef<CharacterJSON[]>([]);
  const cursorDisposableRef = useRef<{ dispose: () => void } | null>(null);

  useEffect(() => {
    const sock = new CollabSocket(room_id, site_id);
    socketRef.current = sock;
    setRemoteCursors({});

    sock.onStateSync = (doc: DocumentJSON) => {
      charsRef.current = Array.isArray(doc.characters) ? [...doc.characters] : [];
      const next = visibleTextFromChars(charsRef.current);
      applyingRemoteRef.current = true;
      setValue(next);
      prevContentRef.current = next;
      applyingRemoteRef.current = false;
    };

    sock.onCursor = (cursor: CursorOperation) => {
      const lineIndex = lineIndexFromOffset(prevContentRef.current, cursor.position);
      setRemoteCursors((prev) => ({ ...prev, [cursor.site_id]: lineIndex }));
    };

    sock.onOperation = (op: Operation) => {
      if (op.type === "insert") {
        const idx = listIndexForVisibleIndex(charsRef.current, op.index);
        charsRef.current.splice(idx, 0, {
          id: [op.site_id, op.counter],
          value: op.value,
          tombstone: false,
        });
      } else {
        const target = charsRef.current.find(
          (c) => c.id[0] === op.site_id && c.id[1] === op.counter,
        );
        if (target) target.tombstone = true;
      }

      const next = visibleTextFromChars(charsRef.current);
      applyingRemoteRef.current = true;
      setValue(next);
      prevContentRef.current = next;
      applyingRemoteRef.current = false;
    };

    return () => {
      cursorDisposableRef.current?.dispose();
      cursorDisposableRef.current = null;
      sock.disconnect();
      socketRef.current = null;
    };
  }, [room_id, site_id]);

  return (
    <div style={{ height: "100vh", width: "100%", position: "relative" }}>
      <div style={{ position: "absolute", inset: 0, zIndex: 10 }}>
        <Cursors cursors={remoteCursors} currentUser={site_id} />
      </div>
      <MonacoEditor
        height="100%"
        theme="vs-dark"
        defaultLanguage="typescript"
        value={value}
        onMount={(editor) => {
          cursorDisposableRef.current?.dispose();
          cursorDisposableRef.current = editor.onDidChangeCursorPosition(() => {
            const sock = socketRef.current;
            if (!sock) return;
            const model = editor.getModel();
            const pos = editor.getPosition();
            if (!model || !pos) return;
            const offset = model.getOffsetAt(pos);
            sock.sendCursor(offset);
          });
        }}
        onChange={(next) => {
          const nextValue = next ?? "";
          const oldValue = prevContentRef.current;

          if (applyingRemoteRef.current) {
            prevContentRef.current = nextValue;
            setValue(nextValue);
            return;
          }

          if (nextValue === oldValue) return;

          const { index, removed, added } = findDiff(oldValue, nextValue);
          const sock = socketRef.current;
          if (!sock) {
            prevContentRef.current = nextValue;
            setValue(nextValue);
            return;
          }

          for (let i = 0; i < removed.length; i++) {
            const ch = charAtVisibleIndex(charsRef.current, index);
            if (!ch) break;
            sock.sendOperation({ type: "delete", site_id: ch.id[0], counter: ch.id[1] });
            ch.tombstone = true;
          }

          for (let i = 0; i < added.length; i++) {
            counterRef.current += 1;
            const op: Operation = {
              type: "insert",
              site_id,
              counter: counterRef.current,
              value: added[i],
              index: index + i,
            };
            sock.sendOperation(op);
            const idx = listIndexForVisibleIndex(charsRef.current, index + i);
            charsRef.current.splice(idx, 0, {
              id: [site_id, counterRef.current],
              value: added[i],
              tombstone: false,
            });
          }

          prevContentRef.current = nextValue;
          setValue(nextValue);
        }}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          scrollBeyondLastLine: false,
          wordWrap: "on",
        }}
      />
    </div>
  );
}

