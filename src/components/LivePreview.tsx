import type { TimerState, AppSettings } from "../types";
import { TimerDisplay } from "./TimerDisplay";
import { getColorState } from "../utils/timerMath";

interface Props {
  state: TimerState;
  settings: AppSettings;
}

export function LivePreview({ state, settings }: Props) {
  const colorState = getColorState(state, settings);
  const bgColor =
    colorState === "normal"
      ? "#030712"
      : colorState === "warning"
      ? "#030712"
      : "#0a0101";

  return (
    <div
      className="w-full rounded-xl border border-gray-700 overflow-hidden flex flex-col"
      style={{ background: bgColor, aspectRatio: "16/9" }}
    >
      {/* Top: label */}
      <div className="flex-1 flex items-end justify-center pb-2 px-4">
        {state.label ? (
          <p className="text-white/60 text-[0.65rem] font-semibold tracking-wide uppercase text-center truncate">
            {state.label}
          </p>
        ) : (
          <p className="text-white/15 text-[0.6rem] font-bold tracking-[0.2em] uppercase text-center">
            STAGECLOCK
          </p>
        )}
      </div>

      {/* Center: clock */}
      <div className="flex items-center justify-center py-1">
        <div className="scale-[0.35] origin-center">
          <TimerDisplay state={state} settings={settings} large />
        </div>
      </div>

      {/* Bottom: next item */}
      <div className="flex-1 flex items-start justify-center pt-2 px-4">
        {state.next_item_label && state.label && settings.showNextItem && (
          <p className="text-white/25 text-[0.55rem] uppercase tracking-widest">
            Next: {state.next_item_label}
          </p>
        )}
      </div>
    </div>
  );
}
