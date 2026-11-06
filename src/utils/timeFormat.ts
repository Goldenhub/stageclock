/**
 * Split ms into h/m/s. Countdowns should pass `roundUp` so the clock shows
 * the full duration for the first second and reaches 00:00 exactly when time
 * runs out (5:00 → 4:59 one second after start, not instantly).
 */
export function msToHMS(
  ms: number,
  roundUp = false
): { h: number; m: number; s: number } {
  const abs = Math.abs(ms) / 1000;
  const totalSeconds = roundUp ? Math.ceil(abs) : Math.floor(abs);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return { h, m, s };
}

export function formatHMS(ms: number, showSign = false): string {
  const { h, m, s } = msToHMS(ms);
  const sign = ms < 0 ? "+" : showSign ? "" : "";
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${sign}${hh}:${mm}:${ss}`;
  return `${sign}${mm}:${ss}`;
}

/** Parse "hh:mm:ss" or "mm:ss" or plain seconds string → seconds */
export function parseTimeInput(value: string): number {
  const trimmed = value.trim();
  const parts = trimmed.split(":").map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] ?? 0;
}

export function secondsToInputValue(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

/**
 * The clock as shown on the stage: MM:SS under an hour (bigger digits),
 * H:MM:SS above. Countdowns round up; overtime gets a leading "+".
 */
export function formatStageClock(ms: number, direction: "up" | "down"): string {
  const roundUp = direction === "down" && ms > 0;
  const { h, m, s } = msToHMS(ms, roundUp);
  const sign = direction === "down" && ms < 0 ? "+" : "";
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${sign}${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${sign}${String(m).padStart(2, "0")}:${ss}`;
}
