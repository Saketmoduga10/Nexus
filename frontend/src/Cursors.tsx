import type { CSSProperties } from "react";

type CursorsProps = {
  cursors: Record<string, number>;
  currentUser: string;
};

const COLORS = ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#ef4444", "#06b6d4"] as const;

function colorForSiteId(site_id: string): string {
  let sum = 0;
  for (let i = 0; i < site_id.length; i++) sum += site_id.charCodeAt(i);
  return COLORS[sum % COLORS.length];
}

export function Cursors({ cursors, currentUser }: CursorsProps) {
  const lineHeightPx = 19;

  const containerStyle: CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  };

  const pillBase: CSSProperties = {
    position: "absolute",
    left: 8,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 650,
    color: "#0b0f17",
    boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
    transform: "translateY(-50%)",
    whiteSpace: "nowrap",
  };

  const cursorLineBase: CSSProperties = {
    width: 2,
    height: 16,
    borderRadius: 2,
    animation: "nexusBlink 1s step-start infinite",
  };

  return (
    <div style={containerStyle}>
      <style>{`
        @keyframes nexusBlink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
      `}</style>
      {Object.entries(cursors)
        .filter(([site_id]) => site_id !== currentUser)
        .map(([site_id, position]) => {
          const color = colorForSiteId(site_id);
          const top = Math.max(0, position) * lineHeightPx;
          return (
            <div key={site_id} style={{ ...pillBase, top, background: color }}>
              <span>{site_id}</span>
              <span style={{ ...cursorLineBase, background: "#0b0f17" }} />
            </div>
          );
        })}
    </div>
  );
}

