import type { TimerState, AppSettings, ColorState } from "../types";
import { formatHMSFull } from "../utils/timeFormat";
import { getColorState, colorStateToStyle } from "../utils/timerMath";

interface Props {
  state: TimerState;
  settings: AppSettings;
  large?: boolean;
}

export function TimerDisplay({ state, settings, large = false }: Props) {
  const colorState: ColorState = getColorState(state, settings);
  const { textClass, flash } = colorStateToStyle(colorState);

  const fontSize = large
    ? "18vw"
    : "clamp(3rem, 8vw, 7rem)";

  if (colorState === "times_up") {
    const label = large ? "TIME'S UP" : "TIME'S UP";
    const textSize = large ? "7vw" : "clamp(2rem, 5vw, 4rem)";
    return (
      <div className="flex flex-col items-center select-none">
        <div
          className="font-bold tracking-widest text-red-500 animate-flash text-center"
          style={{ fontSize: textSize }}
        >
          {label}
        </div>
      </div>
    );
  }

  const ms = state.elapsed_ms;
  const isOvertime = ms < 0;

  return (
    <div className="flex flex-col items-center select-none">
      <div
        className={`font-mono font-bold tabular-nums leading-none ${textClass} ${flash ? "animate-flash" : ""}`}
        style={{ fontSize }}
      >
        {isOvertime ? "+" : ""}
        {formatHMSFull(ms)}
      </div>
      {colorState !== "normal" && (
        <div
          className={`mt-2 text-xs uppercase tracking-widest ${textClass} opacity-70`}
        >
          {colorState === "overtime"
            ? "OVERTIME"
            : colorState === "critical"
            ? "CRITICAL"
            : "WARNING"}
        </div>
      )}
    </div>
  );
}
