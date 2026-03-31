import { useEffect, useRef, useState } from "react";
import MonacoEditor from "@monaco-editor/react";
import type { CharacterJSON, CursorOperation, DocumentJSON, Operation } from "./socket";
import { CollabSocket } from "./socket";
import type * as Monaco from "monaco-editor";

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
  const [remoteCursors, setRemoteCursors] = useState<Record<string, CursorOperation>>({});

  const socketRef = useRef<CollabSocket | null>(null);
  const counterRef = useRef<number>(0);
  const prevContentRef = useRef<string>("");
  const applyingRemoteRef = useRef<boolean>(false);
  const charsRef = useRef<CharacterJSON[]>([]);
  const cursorDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const decorationIdsByUserRef = useRef<Record<string, string[]>>({});

  const COLORS = ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#ef4444", "#06b6d4"] as const;
  const colorForSiteId = (id: string): string => {
    let sum = 0;
    for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
    return COLORS[sum % COLORS.length];
  };

  const safeClass = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "_");

  const applyRemoteDecorations = () => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;

    for (const [remoteSiteId, cursor] of Object.entries(remoteCursors)) {
      const safe = safeClass(remoteSiteId);

      const decorations: Monaco.editor.IModelDeltaDecoration[] = [];

      const pos = model.getPositionAt(Math.max(0, cursor.position));
      decorations.push({
        range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
        options: {
          afterContentClassName: `remote-cursor-${safe}`,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      });

      const start = cursor.selectionStart;
      const end = cursor.selectionEnd;
      if (typeof start === "number" && typeof end === "number" && start !== end) {
        const a = Math.max(0, Math.min(start, end));
        const b = Math.max(0, Math.max(start, end));
        const p1 = model.getPositionAt(a);
        const p2 = model.getPositionAt(b);
        decorations.push({
          range: new monaco.Range(p1.lineNumber, p1.column, p2.lineNumber, p2.column),
          options: {
            className: `remote-cursor-selection-${safe}`,
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        });
      }

      const prevIds = decorationIdsByUserRef.current[remoteSiteId] ?? [];
      const nextIds = editor.deltaDecorations(prevIds, decorations);
      decorationIdsByUserRef.current[remoteSiteId] = nextIds;
    }
  };

  useEffect(() => {
    const sock = new CollabSocket(room_id, site_id);
    socketRef.current = sock;
    setRemoteCursors({});
    decorationIdsByUserRef.current = {};

    sock.onStateSync = (doc: DocumentJSON) => {
      charsRef.current = Array.isArray(doc.characters) ? [...doc.characters] : [];
      const next = visibleTextFromChars(charsRef.current);
      applyingRemoteRef.current = true;
      setValue(next);
      prevContentRef.current = next;
      applyingRemoteRef.current = false;
    };

    sock.onCursor = (cursor: CursorOperation) => {
      setRemoteCursors((prev) => ({ ...prev, [cursor.site_id]: cursor }));
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
      editorRef.current = null;
      monacoRef.current = null;
      sock.disconnect();
      socketRef.current = null;
    };
  }, [room_id, site_id]);

  useEffect(() => {
    const styleElId = "nexus-remote-cursors-style";
    let el = document.getElementById(styleElId) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = styleElId;
      document.head.appendChild(el);
    }

    const users = Object.keys(remoteCursors);
    const css =
      `
@keyframes nexusRemoteCursorBlink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
` +
      users
        .map((uid) => {
          const color = colorForSiteId(uid);
          const safe = safeClass(uid);
          return `
.remote-cursor-${safe} {
  position: relative;
  display: inline-block;
  width: 0;
  height: 1.4em;
  vertical-align: text-bottom;
  pointer-events: none;
}
.remote-cursor-${safe}::after {
  content: "";
  position: absolute;
  left: -1px;
  top: -0.15em;
  bottom: -0.15em;
  width: 2px;
  background: ${color};
  animation: nexusRemoteCursorBlink 1s step-start infinite;
}
.remote-cursor-selection-${safe} {
  background: ${color}33;
}
`;
        })
        .join("\n");

    el.textContent = css;

    applyRemoteDecorations();
  }, [remoteCursors]);

  return (
    <div style={{ height: "100vh", width: "100%" }}>
      <MonacoEditor
        height="100%"
        theme="vs-dark"
        defaultLanguage="typescript"
        value={value}
        onMount={(editor, monaco) => {
          editorRef.current = editor;
          monacoRef.current = monaco as unknown as typeof Monaco;
          cursorDisposableRef.current?.dispose();
          cursorDisposableRef.current = editor.onDidChangeCursorPosition(() => {
            const sock = socketRef.current;
            if (!sock) return;
            const model = editor.getModel();
            const pos = editor.getPosition();
            if (!model || !pos) return;

            const offset = model.getOffsetAt(pos);
            const sel = editor.getSelection();
            if (sel && !sel.isEmpty()) {
              const selectionStart = model.getOffsetAt(sel.getStartPosition());
              const selectionEnd = model.getOffsetAt(sel.getEndPosition());
              sock.sendCursor(offset, selectionStart, selectionEnd);
            } else {
              sock.sendCursor(offset);
            }
          });

          applyRemoteDecorations();
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

