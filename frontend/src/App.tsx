import { useMemo, useState } from "react";
import { Editor } from "./Editor";

type Session = { room_id: string; site_id: string } | null;

function App() {
  const [roomInput, setRoomInput] = useState<string>("");
  const [userInput, setUserInput] = useState<string>("");
  const [session, setSession] = useState<Session>(null);

  const canJoin = useMemo(() => roomInput.trim().length > 0 && userInput.trim().length > 0, [roomInput, userInput]);

  if (session) {
    return <Editor room_id={session.room_id} site_id={session.site_id} />;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0b0f17",
        color: "#e6edf3",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 16,
          padding: 20,
          boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 650 }}>Join a room</div>
          <div style={{ fontSize: 13, color: "rgba(230,237,243,0.72)" }}>
            Enter a room ID and a username to start collaborating.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: "rgba(230,237,243,0.80)" }}>Room ID</span>
            <input
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
              placeholder="e.g. team-alpha"
              autoComplete="off"
              spellCheck={false}
              style={{
                height: 40,
                padding: "0 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.25)",
                color: "#e6edf3",
                outline: "none",
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: "rgba(230,237,243,0.80)" }}>Username</span>
            <input
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="e.g. saket"
              autoComplete="off"
              spellCheck={false}
              style={{
                height: 40,
                padding: "0 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.25)",
                color: "#e6edf3",
                outline: "none",
              }}
            />
          </label>

          <button
            disabled={!canJoin}
            onClick={() => setSession({ room_id: roomInput.trim(), site_id: userInput.trim() })}
            style={{
              height: 42,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              background: canJoin ? "#2563eb" : "rgba(255,255,255,0.08)",
              color: canJoin ? "white" : "rgba(230,237,243,0.55)",
              fontWeight: 650,
              cursor: canJoin ? "pointer" : "not-allowed",
              marginTop: 4,
            }}
          >
            Join
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
