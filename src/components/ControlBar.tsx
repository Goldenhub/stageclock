import { Play, Pause, Square, RotateCcw } from "lucide-react";
import type { TimerState } from "../types";
import { Button, Kbd, Segmented } from "./ui";

interface Props {
  state: TimerState;
  disabled?: boolean;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onReset: () => void;
  onAdjust: (deltaSeconds: number) => void;
  onAllowOvertime: (allow: boolean) => void;
}

const ADJUSTMENTS = [-600, -300, -60, 60, 300, 600];

export function ControlBar({
  state,
  disabled,
  onStart,
  onPause,
  onStop,
  onReset,
  onAdjust,
  onAllowOvertime,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      {/* Transport */}
      <div className="flex gap-2">
        {state.running ? (
          <Button variant="warning" size="lg" className="flex-1" onClick={onPause} disabled={disabled}>
            <Pause size={20} fill="currentColor" /> Pause
            <span className="ml-1 opacity-60"><Kbd>Space</Kbd></span>
          </Button>
        ) : (
          <Button variant="success" size="lg" className="flex-1" onClick={onStart} disabled={disabled}>
            <Play size={20} fill="currentColor" /> Start
            <span className="ml-1 opacity-70"><Kbd>Space</Kbd></span>
          </Button>
        )}
        <Button size="lg" onClick={onReset} disabled={disabled} title="Reset to the full time (keeps running if running)">
          <RotateCcw size={18} /> Reset
        </Button>
        <Button size="lg" onClick={onStop} disabled={disabled} title="Stop and reset">
          <Square size={16} fill="currentColor" /> Stop
        </Button>
      </div>

      {/* Add / remove time */}
      <div className="flex items-center gap-1.5">
        {ADJUSTMENTS.map((delta) => (
          <Button
            key={delta}
            size="sm"
            className={`flex-1 tabular-nums ${delta > 0 ? "text-emerald-300" : "text-zinc-300"}`}
            onClick={() => onAdjust(delta)}
            disabled={disabled}
          >
            {delta > 0 ? "+" : "−"}
            {Math.abs(delta) / 60} min
          </Button>
        ))}
      </div>

      {/* What happens at zero */}
      {state.direction === "down" && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-zinc-500">When time runs out, show</span>
          <div className="w-64">
            <Segmented
              size="sm"
              value={state.allow_overtime ? "count" : "stop"}
              onChange={(v) => onAllowOvertime(v === "count")}
              options={[
                { value: "stop", label: "TIME'S UP" },
                { value: "count", label: "Overtime count" },
              ]}
            />
          </div>
        </div>
      )}
    </div>
  );
}
