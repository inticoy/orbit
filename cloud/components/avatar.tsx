import type { Satellite } from "@/lib/satellites";
import { SHAPES, isShapeName } from "@/lib/shapes";

type Status = "working" | "ask" | "idle";

const statusColor: Record<Status, string> = { working: "#34c759", ask: "#ff9500", idle: "transparent" };

/** The simple Grok-style avatar: a colored silhouette (or rounded shape) with two eyes, and a status dot. */
export function Avatar({ satellite, size = 40, status = "idle" }: { satellite: Satellite; size?: number; status?: Status }) {
  const eyeW = Math.max(3, Math.round(size * 0.1));
  const eyeH = Math.round(size * 0.24);
  const gap = Math.round(size * 0.12);
  const eye = { width: eyeW, height: eyeH, borderRadius: eyeW, background: "#fff", transform: "rotate(12deg)" };
  const shape = isShapeName(satellite.shape) ? SHAPES[satellite.shape] : null;
  const dot = status === "idle" ? null : (
    <span
      className="absolute rounded-full ring-2 ring-app-side"
      style={{ right: -2, bottom: -2, width: Math.max(10, size * 0.28), height: Math.max(10, size * 0.28), background: statusColor[status] }}
    />
  );
  if (shape) {
    const [cx, cy] = shape.eyes;
    return (
      <span aria-hidden="true" className="relative inline-block shrink-0" style={{ width: size, height: size }}>
        <svg className="absolute inset-0 overflow-visible" height={size} viewBox="0 0 100 100" width={size}>
          <path d={shape.d} fill={satellite.color} stroke={satellite.color} strokeLinejoin="round" strokeWidth={shape.round} />
        </svg>
        <span className="absolute" style={{ ...eye, left: (cx * size) / 100 - gap / 2 - eyeW, top: (cy * size) / 100 - eyeH / 2 }} />
        <span className="absolute" style={{ ...eye, left: (cx * size) / 100 + gap / 2, top: (cy * size) / 100 - eyeH / 2 }} />
        {dot}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size, borderRadius: satellite.shape, background: satellite.color, gap }}
    >
      <span style={eye} />
      <span style={eye} />
      {dot}
    </span>
  );
}

/** The Orbit mark: a black rounded body with two tilted eyes, like the satellites. */
export function OrbitMark({ size = 28, inverse, tight }: { size?: number; inverse?: boolean; tight?: boolean }) {
  // Eyes are cut out in the background color; on a dark tile (inverse) they take the ink color.
  const eye = inverse ? "var(--color-app-ink)" : "var(--color-app-bg)";
  return (
    <svg aria-hidden="true" className="shrink-0" height={size} viewBox={tight ? "12 12 40 40" : "0 0 64 64"} width={size}>
      <rect fill="currentColor" height="40" rx="15" width="40" x="12" y="12" />
      <rect fill={eye} height="13" rx="2.8" transform="rotate(12 26.7 32)" width="5.6" x="23.9" y="25.5" />
      <rect fill={eye} height="13" rx="2.8" transform="rotate(12 37.3 32)" width="5.6" x="34.5" y="25.5" />
    </svg>
  );
}
