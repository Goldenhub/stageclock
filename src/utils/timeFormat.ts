export function msToHMS(ms: number): { h: number; m: number; s: number } {
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);
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

export function formatHMSFull(ms: number): string {
  const { h, m, s } = msToHMS(ms);
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
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
