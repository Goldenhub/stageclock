import type { TimerState } from "../types";

interface Props {
  state: TimerState;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onReset: () => void;
  onAdjust: (delta: number) => void;
}

const btn =
  "px-4 py-3 rounded-lg font-semibold text-sm uppercase tracking-wide transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-950";

export function ControlBar({
  state,
  onStart,
  onPause,
  onStop,
  onReset,
  onAdjust,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      {/* Primary controls */}
      <div className="flex gap-2 justify-center">
        {!state.running ? (
          <button
            onClick={onStart}
            className={`${btn} bg-green-600 hover:bg-green-500 text-white focus:ring-green-500 flex-1`}
          >
            ▶ Start
          </button>
        ) : (
          <button
            onClick={onPause}
            className={`${btn} bg-amber-500 hover:bg-amber-400 text-black focus:ring-amber-400 flex-1`}
          >
            ⏸ Pause
          </button>
        )}
        <button
          onClick={onStop}
          className={`${btn} bg-gray-700 hover:bg-gray-600 text-white focus:ring-gray-500`}
        >
          ⏹ Stop
        </button>
        <button
          onClick={onReset}
          className={`${btn} bg-gray-700 hover:bg-gray-600 text-white focus:ring-gray-500`}
        >
          ↺ Reset
        </button>
      </div>

      {/* Adjust controls */}
      <div className="flex gap-2 justify-center">
        {[-300, -60, 60, 300].map((delta) => {
          const label =
            delta < 0
              ? `−${Math.abs(delta) / 60}m`
              : `+${delta / 60}m`;
          return (
            <button
              key={delta}
              onClick={() => onAdjust(delta)}
              className={`${btn} bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 text-xs flex-1`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
