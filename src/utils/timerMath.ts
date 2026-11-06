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
