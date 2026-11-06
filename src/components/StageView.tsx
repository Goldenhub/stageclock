import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TimerState, AppSettings } from "../types";
import { getColorState } from "../utils/timerMath";
import { formatStageClock } from "../utils/timeFormat";
import logoUrl from "../assets/logo.png";

interface Props {
  state: TimerState;
  settings: AppSettings;
}

const DIGIT_COLOR: Record<string, string> = {
  normal: "text-white",
  warning: "text-amber-400",
  critical: "text-red-500",
  overtime: "text-red-500",
  times_up: "text-red-500",
};

const BAR_COLOR: Record<string, string> = {
  normal: "bg-emerald-500",
  warning: "bg-amber-400",
  critical: "bg-red-500",
  overtime: "bg-red-500",
  times_up: "bg-red-500",
};

/** Current time of day, refreshed every second. */
function useWallClock(enabled: boolean): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Track an element's size. Used instead of CSS container units (cqw/cqh),
 * which older macOS WebViews (Safari < 16) don't support — there the clock
 * would silently fall back to a tiny default size.
 */
function useBoxSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ...size };
}

/**
 * What the speaker sees. Used full-screen by the display window and, scaled
 * down, as the operator's live preview — so the two can never disagree.
 * Every size is a fraction of the box it is drawn in, so the clock fills the
 * whole projector or a small preview card alike.
 */
export function StageView({ state, settings }: Props) {
  const box = useBoxSize();
  // Percent of the box's width / height, in px.
  const cw = (pct: number) => (box.w * pct) / 100;
  const ch = (pct: number) => (box.h * pct) / 100;
  // The smaller of a width-based and a height-based size.
  const fit = (wPct: number, hPct: number) => Math.min(cw(wPct), ch(hPct));

  // With nothing loaded, the stage shows the time of day instead of 00:00.
  const idle = state.active_item_id === null;
  const wallClock = useWallClock(idle);

  const colorState = getColorState(state, settings);
  const isTimesUp = colorState === "times_up";
  const clock = formatStageClock(state.elapsed_ms, state.direction);
  const longClock = clock.length > 6; // H:MM:SS or longer needs more width

  // Fraction of a countdown remaining, for the progress bar.
  const progress =
    state.direction === "down" && state.duration_ms > 0
      ? Math.min(1, Math.max(0, state.elapsed_ms / state.duration_ms))
      : null;

  // A message to the speaker takes the place of the "Next" line.
  const showNext =
    settings.showNextItem && !!state.label && !!state.next_item_label && !state.banner_text;

  return (
    <div ref={box.ref} className="relative h-full w-full overflow-hidden bg-black text-white select-none">
      {/* Subtle red wash when time is up or over, so it reads from the back */}
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${
          colorState === "times_up" || colorState === "overtime" ? "opacity-100" : "opacity-0"
        }`}
        style={{ background: "radial-gradient(ellipse at center, rgba(220,38,38,0.22), transparent 70%)" }}
      />

      <div className="relative flex h-full w-full flex-col items-center">
        {/* Current item */}
        <div
          className="flex w-full shrink-0 items-end justify-center text-center"
          style={{ height: ch(16), paddingInline: cw(4) }}
        >
          {state.label ? (
            <h1
              className="truncate font-semibold tracking-tight text-white/85"
              style={{ fontSize: fit(5.5, 9), lineHeight: 1.1 }}
            >
              {state.label}
            </h1>
          ) : (
            <img src={logoUrl} alt="" className="opacity-30" style={{ height: ch(9) }} />
          )}
        </div>

        {/* Clock — as large as the box allows */}
        <div className="flex w-full flex-1 items-center justify-center">
          {idle ? (
            <div
              className="stage-digits font-semibold leading-none text-white/35"
              style={{ fontSize: fit(20, 50) }}
            >
              {wallClock}
            </div>
          ) : isTimesUp ? (
            <div
              className="animate-pulse-slow font-black uppercase tracking-tight text-red-500"
              style={{ fontSize: fit(17, 40), lineHeight: 1 }}
            >
              Time's up
            </div>
          ) : (
            <div
              className={`stage-digits font-bold leading-none ${DIGIT_COLOR[colorState]} ${
                colorState === "overtime" ? "animate-pulse-slow" : ""
              }`}
              style={{
                fontSize: longClock ? fit(23, 60) : fit(32, 70),
              }}
            >
              {clock}
            </div>
          )}
        </div>

        {/* Next item */}
        <div
          className="flex w-full shrink-0 items-start justify-center text-center"
          style={{ height: ch(12), paddingInline: cw(4) }}
        >
          {showNext && (
            <p
              className="truncate uppercase tracking-[0.18em] text-white/40"
              style={{ fontSize: fit(2.4, 4.5) }}
            >
              Next · <span className="text-white/70">{state.next_item_label}</span>
            </p>
          )}
        </div>
      </div>

      {/* Countdown progress */}
      {progress !== null && (
        <div className="absolute inset-x-0 bottom-0 bg-white/10" style={{ height: Math.max(2, ch(1.2)) }}>
          <div
            className={`h-full transition-[width] duration-200 ease-linear ${BAR_COLOR[colorState]}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}

      {/* Message to the speaker */}
      {state.banner_text && (
        <div
          className="absolute inset-x-0 flex justify-center"
          style={{ bottom: ch(4.5), paddingInline: cw(4) }}
        >
          <div
            className="max-w-full bg-white text-center font-semibold text-black shadow-2xl animate-banner-in"
            style={{
              fontSize: fit(4.6, 8),
              lineHeight: 1.15,
              borderRadius: ch(1.2),
              paddingInline: cw(3),
              paddingBlock: ch(1.6),
            }}
          >
            {state.banner_text}
          </div>
        </div>
      )}
    </div>
  );
}
