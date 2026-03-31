import { useEffect, useRef, useState } from "react";
import MonacoEditor from "@monaco-editor/react";
import type { CharacterJSON, DocumentJSON, Operation } from "./socket";
import { CollabSocket } from "./socket";

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

export function Editor({ room_id, site_id }: EditorProps) {
  const [value, setValue] = useState<string>("");

  const socketRef = useRef<CollabSocket | null>(null);
  const counterRef = useRef<number>(0);
  const prevContentRef = useRef<string>("");
  const applyingRemoteRef = useRef<boolean>(false);
  const charsRef = useRef<CharacterJSON[]>([]);

  useEffect(() => {
    const sock = new CollabSocket(room_id, site_id);
    socketRef.current = sock;

    sock.onStateSync = (doc: DocumentJSON) => {
      charsRef.current = Array.isArray(doc.characters) ? [...doc.characters] : [];
      const next = visibleTextFromChars(charsRef.current);
      applyingRemoteRef.current = true;
      setValue(next);
      prevContentRef.current = next;
      applyingRemoteRef.current = false;
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
      sock.disconnect();
      socketRef.current = null;
    };
  }, [room_id, site_id]);

  return (
    <div style={{ height: "100vh", width: "100%" }}>
      <MonacoEditor
        height="100%"
        theme="vs-dark"
        defaultLanguage="typescript"
        value={value}
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

