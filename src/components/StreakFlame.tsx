// Shared visual badge for a player on a hot streak. Renders nothing
// below the threshold (keeps the badge meaningful — a single win
// shouldn't celebrate). 3-9 → static flame; ≥10 → pulses gently.
// Display caps at 99+ to keep the chip compact.

export function StreakFlame({
  n,
  size = "sm",
}: {
  n: number;
  /** Visual size. "sm" sits in a chat-feed avatar corner; "md" is the
   *  header balance pill; "xs" is the active-players strip badge. */
  size?: "xs" | "sm" | "md";
}) {
  if (!Number.isFinite(n) || n < 3) return null;
  const display = n > 99 ? "×99+" : `×${n}`;
  const pulse = n >= 10;
  const cls = ["streak-flame", `streak-flame-${size}`, pulse ? "streak-flame-pulse" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} title={`Hot streak — ${n} wins in a row`} aria-label={`Hot streak: ${n}`}>
      <span aria-hidden style={{ marginRight: 1 }}>🔥</span>
      <span>{display}</span>
    </span>
  );
}
