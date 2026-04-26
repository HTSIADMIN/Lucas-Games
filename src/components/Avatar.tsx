// Stacked avatar: BG (color or gradient) + frame border + hat overlay
// + level badge (top-right) + champion crown (top-left for #1 only).
import type { CSSProperties } from "react";
import { GameIcon } from "@/components/GameIcon";
import { findItem } from "@/lib/shop/catalog";

export function Avatar({
  initials,
  color,
  size = 48,
  level,
  frame,
  hat,
  champion,
  className,
  fontSize,
  style,
}: {
  initials: string;
  color: string;
  size?: number;
  level?: number;
  frame?: string | null;
  hat?: string | null;
  champion?: boolean;
  className?: string;
  fontSize?: number;
  style?: CSSProperties;
}) {
  const baseBorderWidth = size <= 24 ? 2 : size <= 40 ? 2 : 3;
  const fs = fontSize ?? Math.floor(size * 0.4);

  // Frame metadata (color, width, optional badge, glow flag).
  const frameItem = frame ? findItem(frame) : undefined;
  const frameMeta = (frameItem?.meta ?? {}) as { color?: string; width?: number; glow?: boolean; badge?: string };
  const effectiveBorderWidth = frameItem ? (frameMeta.width ?? baseBorderWidth) : baseBorderWidth;
  const effectiveBorderColor = frameItem ? (frameMeta.color ?? "var(--ink-900)") : "var(--ink-900)";
  const frameGlow = frameItem && frameMeta.glow ? `0 0 12px ${frameMeta.color}` : undefined;

  // Hat metadata.
  const hatItem = hat ? findItem(hat) : undefined;
  const hatMeta = (hatItem?.meta ?? {}) as { hat?: HatKind };

  return (
    <span
      className={className}
      style={{
        position: "relative",
        display: "inline-block",
        width: size,
        height: size,
        flexShrink: 0,
        ...style,
      }}
    >
      <span
        className="avatar"
        style={{
          width: size,
          height: size,
          borderWidth: effectiveBorderWidth,
          borderColor: effectiveBorderColor,
          background: color,
          fontSize: fs,
          color: "var(--ink-900)",
          boxShadow: frameGlow,
        }}
      >
        {initials}
      </span>

      {hatMeta.hat && <Hat kind={hatMeta.hat} size={size} />}

      {typeof level === "number" && level > 0 && (
        <span
          aria-label={`Level ${level}`}
          style={{
            position: "absolute",
            top: -6,
            right: -6,
            minWidth: size <= 32 ? 16 : 20,
            height: size <= 32 ? 16 : 20,
            padding: "0 4px",
            background: "var(--gold-300)",
            color: "var(--ink-900)",
            border: "2px solid var(--ink-900)",
            borderRadius: 999,
            fontFamily: "var(--font-display)",
            fontSize: size <= 32 ? 10 : 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textShadow: "1px 1px 0 var(--gold-100)",
            boxShadow: "var(--sh-card-rest)",
            lineHeight: 1,
            zIndex: 2,
          }}
        >
          {level}
        </span>
      )}

      {champion && (
        <span
          aria-label="Sheriff (1st on leaderboard)"
          title="Sheriff — 1st on the leaderboard"
          style={{
            position: "absolute",
            top: -size * 0.55,
            left: -size * 0.05,
            transform: "rotate(-12deg)",
            filter: "drop-shadow(2px 2px 0 var(--ink-900))",
            zIndex: 3,
            pointerEvents: "none",
          }}
        >
          <GameIcon name="ui.crown" size={Math.max(20, Math.floor(size * 0.6))} />
        </span>
      )}
    </span>
  );
}

type HatKind =
  | "stetson_brown"
  | "stetson_black"
  | "sheriff"
  | "sombrero"
  | "tophat"
  | "bandana_red"
  | "bandana_blue"
  | "halo";

function Hat({ kind, size }: { kind: HatKind; size: number }) {
  const w = size * 1.05;
  const h = size * 0.55;
  const top = -h * 0.55;
  const left = -(w - size) / 2;
  return (
    <span
      style={{
        position: "absolute",
        top,
        left,
        width: w,
        height: h,
        pointerEvents: "none",
        zIndex: 1,
        filter: "drop-shadow(1px 2px 0 var(--ink-900))",
      }}
    >
      <svg
        viewBox="0 0 32 18"
        width={w}
        height={h}
        shapeRendering="crispEdges"
        style={{ display: "block" }}
      >
        {hatPath(kind)}
      </svg>
    </span>
  );
}

function hatPath(kind: HatKind): React.ReactNode {
  switch (kind) {
    case "stetson_brown":
      return (
        <>
          <rect x="2" y="13" width="28" height="3" fill="#6b3f24" />
          <rect x="2" y="16" width="28" height="2" fill="#3d2418" />
          <rect x="9" y="6" width="14" height="7" fill="#6b3f24" />
          <rect x="10" y="4" width="12" height="2" fill="#6b3f24" />
          <rect x="11" y="3" width="10" height="1" fill="#a87545" />
          <rect x="9" y="6" width="14" height="1" fill="#a87545" />
          <rect x="15" y="3" width="2" height="3" fill="#3d2418" />
        </>
      );
    case "stetson_black":
      return (
        <>
          <rect x="2" y="13" width="28" height="3" fill="#1a0f08" />
          <rect x="2" y="16" width="28" height="2" fill="#000" />
          <rect x="9" y="6" width="14" height="7" fill="#1a0f08" />
          <rect x="10" y="4" width="12" height="2" fill="#1a0f08" />
          <rect x="11" y="3" width="10" height="1" fill="#3d2418" />
          <rect x="15" y="3" width="2" height="3" fill="#000" />
          <rect x="9" y="11" width="14" height="2" fill="#f5c842" />
        </>
      );
    case "sheriff":
      return (
        <>
          <rect x="2" y="13" width="28" height="3" fill="#4a2818" />
          <rect x="2" y="16" width="28" height="2" fill="#1a0f08" />
          <rect x="9" y="6" width="14" height="7" fill="#4a2818" />
          <rect x="10" y="4" width="12" height="2" fill="#4a2818" />
          <rect x="11" y="3" width="10" height="1" fill="#6b3f24" />
          <rect x="9" y="11" width="14" height="2" fill="#f5c842" />
          <rect x="14" y="9" width="4" height="4" fill="#ffd84d" />
          <rect x="15" y="8" width="2" height="1" fill="#ffd84d" />
          <rect x="15" y="13" width="2" height="1" fill="#ffd84d" />
        </>
      );
    case "sombrero":
      return (
        <>
          <rect x="0" y="11" width="32" height="4" fill="#a87545" />
          <rect x="0" y="14" width="32" height="2" fill="#6b3f24" />
          <rect x="0" y="11" width="32" height="1" fill="#d4a574" />
          <rect x="11" y="4" width="10" height="7" fill="#a87545" />
          <rect x="12" y="2" width="8" height="2" fill="#a87545" />
          <rect x="13" y="1" width="6" height="1" fill="#d4a574" />
          <rect x="11" y="9" width="10" height="2" fill="#e05a3c" />
        </>
      );
    case "tophat":
      return (
        <>
          <rect x="3" y="13" width="26" height="3" fill="#1a0f08" />
          <rect x="3" y="16" width="26" height="2" fill="#000" />
          <rect x="11" y="0" width="10" height="13" fill="#1a0f08" />
          <rect x="12" y="2" width="8" height="2" fill="#3d2418" />
          <rect x="11" y="10" width="10" height="2" fill="#8b3a3a" />
        </>
      );
    case "bandana_red":
      return (
        <>
          <rect x="2" y="6" width="28" height="6" fill="#e05a3c" />
          <rect x="2" y="6" width="28" height="1" fill="#ff5544" />
          <rect x="2" y="11" width="28" height="1" fill="#8b3a3a" />
          <rect x="6" y="8" width="2" height="2" fill="#fef6e4" />
          <rect x="13" y="9" width="2" height="2" fill="#fef6e4" />
          <rect x="20" y="8" width="2" height="2" fill="#fef6e4" />
          <rect x="26" y="9" width="2" height="2" fill="#fef6e4" />
          <rect x="28" y="4" width="3" height="3" fill="#e05a3c" />
        </>
      );
    case "bandana_blue":
      return (
        <>
          <rect x="2" y="6" width="28" height="6" fill="#2c6a8e" />
          <rect x="2" y="6" width="28" height="1" fill="#5fa8d3" />
          <rect x="2" y="11" width="28" height="1" fill="#143348" />
          <rect x="6" y="8" width="2" height="2" fill="#fef6e4" />
          <rect x="13" y="9" width="2" height="2" fill="#fef6e4" />
          <rect x="20" y="8" width="2" height="2" fill="#fef6e4" />
          <rect x="26" y="9" width="2" height="2" fill="#fef6e4" />
          <rect x="28" y="4" width="3" height="3" fill="#2c6a8e" />
        </>
      );
    case "halo":
      return (
        <>
          <ellipse cx="16" cy="13" rx="11" ry="3" fill="none" stroke="#ffd84d" strokeWidth="2" />
          <ellipse cx="16" cy="13" rx="11" ry="3" fill="none" stroke="#fff8e1" strokeWidth="1" />
        </>
      );
  }
}
