import { useState, useRef } from "react";
import type { ScheduleItem } from "../types";

interface Props {
  item?: ScheduleItem;
  onSave: (item: Omit<ScheduleItem, "id">) => void;
  onCancel: () => void;
}

function Spinner({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
  onArrowLeft,
  onArrowRight,
  focusRef,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
  onArrowLeft?: () => void;
  onArrowRight?: () => void;
  focusRef?: React.RefObject<HTMLDivElement>;
}) {
  const internalRef = useRef<HTMLDivElement>(null);
  const ref = focusRef || internalRef;

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        onChange(Math.min(max, value + 1));
        break;
      case "ArrowDown":
        e.preventDefault();
        onChange(Math.max(min, value - 1));
        break;
      case "ArrowRight":
        e.preventDefault();
        onArrowRight?.();
        break;
      case "ArrowLeft":
        e.preventDefault();
        onArrowLeft?.();
        break;
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="text-gray-400 hover:text-white text-xs w-14 h-6 flex items-center justify-center rounded hover:bg-gray-700 transition-colors"
      >
        ▲
      </button>
      <div
        ref={ref}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="w-14 h-10 bg-gray-800 border border-gray-600 rounded-md flex items-center justify-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
      >
        <span className="font-mono text-lg text-white tabular-nums select-none">
          {String(value).padStart(2, "0")}
        </span>
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="text-gray-400 hover:text-white text-xs w-14 h-6 flex items-center justify-center rounded hover:bg-gray-700 transition-colors"
      >
        ▼
      </button>
    </div>
  );
}

export function AddTimeSlotDialog({ item, onSave, onCancel }: Props) {
  const initDuration = item?.duration ?? 600;
  const [label, setLabel] = useState(item?.label ?? "");
  const [hours, setHours] = useState(Math.floor(initDuration / 3600));
  const [minutes, setMinutes] = useState(Math.floor((initDuration % 3600) / 60));
  const [seconds, setSeconds] = useState(initDuration % 60);
  const [direction, setDirection] = useState<"up" | "down">(item?.direction ?? "down");
  const [notes, setNotes] = useState(item?.notes ?? "");

  const hoursRef = useRef<HTMLDivElement>(null);
  const minutesRef = useRef<HTMLDivElement>(null);
  const secondsRef = useRef<HTMLDivElement>(null);

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || totalSeconds === 0) return;
    onSave({
      label: label.trim(),
      duration: totalSeconds,
      direction,
      notes: notes.trim() || undefined,
    });
  }

  const input =
    "w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm flex flex-col gap-4 shadow-2xl"
      >
        <h3 className="text-base font-semibold text-gray-200">
          {item ? "Edit Time Slot" : "Add Time Slot"}
        </h3>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Title</label>
          <input
            className={input}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Opening Prayer"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Duration</label>
          <div className="flex items-center justify-center gap-2">
            <Spinner value={hours} onChange={setHours} max={23} label="HH"
              focusRef={hoursRef}
              onArrowRight={() => minutesRef.current?.focus()} />
            <span className="text-gray-500 text-lg font-bold mt-4">:</span>
            <Spinner value={minutes} onChange={setMinutes} max={59} label="MM"
              focusRef={minutesRef}
              onArrowLeft={() => hoursRef.current?.focus()}
              onArrowRight={() => secondsRef.current?.focus()} />
            <span className="text-gray-500 text-lg font-bold mt-4">:</span>
            <Spinner value={seconds} onChange={setSeconds} max={59} label="SS"
              focusRef={secondsRef}
              onArrowLeft={() => minutesRef.current?.focus()} />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Direction</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDirection("down")}
              className={`flex-1 py-2 rounded-md text-sm font-semibold border transition-colors ${
                direction === "down"
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"
              }`}
            >
              ↓ Countdown
            </button>
            <button
              type="button"
              onClick={() => setDirection("up")}
              className={`flex-1 py-2 rounded-md text-sm font-semibold border transition-colors ${
                direction === "up"
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"
              }`}
            >
              ↑ Count up
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400">Notes (optional)</label>
          <input
            className={input}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional notes…"
          />
        </div>

        <div className="flex gap-2 mt-1">
          <button
            type="submit"
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md px-3 py-2 text-sm font-semibold transition-colors"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-md px-3 py-2 text-sm font-semibold transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
