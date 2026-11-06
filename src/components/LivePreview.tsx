import type { TimerState, AppSettings } from "../types";
import { StageView } from "./StageView";

interface Props {
  state: TimerState;
  settings: AppSettings;
  live: boolean;
}

/** "On screen" / "Preview" status pill shown above the preview. */
export function LiveBadge({ live }: { live: boolean }) {
  return live ? (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-red-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-red-400">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> On screen
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800/80 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" /> Preview only
    </span>
  );
}

/** A pixel-for-pixel miniature of the stage display. */
export function LivePreview({ state, settings, live }: Props) {
  return (
    // Height-capped so the transport controls below always stay on screen.
    <div className="relative mx-auto w-full" style={{ maxWidth: "calc(44vh * 16 / 9)" }}>
      <div
        className={`overflow-hidden rounded-xl ring-1 transition-shadow ${
          live ? "ring-red-500/70 shadow-[0_0_0_4px_rgba(239,68,68,0.12)]" : "ring-zinc-800"
        }`}
        style={{ aspectRatio: "16 / 9" }}
      >
        <StageView state={state} settings={settings} />
      </div>
    </div>
  );
}
