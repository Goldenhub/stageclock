import type { TimerState, AppSettings, ColorState } from "../types";

export function getColorState(
  state: TimerState,
  settings: AppSettings
): ColorState {
  if (state.overtime) {
    return state.allow_overtime ? "overtime" : "times_up";
  }
  if (state.direction === "down" && state.duration_ms > 0) {
    const remainingSeconds = state.elapsed_ms / 1000;
    if (remainingSeconds <= settings.alertThresholds.criticalSeconds)
      return "critical";
    if (remainingSeconds <= settings.alertThresholds.warningSeconds)
      return "warning";
  }
  return "normal";
}

export function colorStateToStyle(colorState: ColorState): {
  textClass: string;
  flash: boolean;
} {
  switch (colorState) {
    case "warning":
      return { textClass: "text-amber-400", flash: false };
    case "critical":
      return { textClass: "text-red-500", flash: true };
    case "overtime":
      return { textClass: "text-red-500", flash: true };
    case "times_up":
      return { textClass: "text-red-500", flash: false }; // text itself animates
    default:
      return { textClass: "text-white", flash: false };
  }
}
