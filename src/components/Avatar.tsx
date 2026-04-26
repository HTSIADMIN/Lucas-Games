// Avatar with optional top-right level badge.
import type { CSSProperties } from "react";

export function Avatar({
  initials,
  color,
  size = 48,
  level,
  className,
  fontSize,
  style,
}: {
  initials: string;
  color: string;
  size?: number;
  level?: number;
  className?: string;
  fontSize?: number;
  style?: CSSProperties;
}) {
  const borderWidth = size <= 24 ? 2 : size <= 40 ? 2 : 3;
  const fs = fontSize ?? Math.floor(size * 0.4);
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
          borderWidth,
          background: color,
          fontSize: fs,
          color: "var(--ink-900)",
        }}
      >
        {initials}
      </span>
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
            zIndex: 1,
          }}
        >
          {level}
        </span>
      )}
    </span>
  );
}
