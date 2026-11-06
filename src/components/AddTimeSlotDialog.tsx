import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { ScheduleItem } from "../types";
import { Button, Modal, Segmented, inputClass } from "./ui";

interface Props {
  mode: "add" | "edit" | "quick";
  item?: ScheduleItem;
  onSave: (item: Omit<ScheduleItem, "id">) => void;
  onCancel: () => void;
}

const PRESET_MINUTES = [5, 10, 15, 20, 30, 45, 60];

function TimeField({
  value,
  onChange,
  max,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  max: number;
  label: string;
}) {
  return (
    <label className="flex flex-col items-center gap-1.5">
      <input
        type="number"
        min={0}
        max={max}
        value={String(value).padStart(2, "0")}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const n = Math.floor(Number(e.target.value.replace(/\D/g, "").slice(-2)) || 0);
          onChange(Math.min(max, Math.max(0, n)));
        }}
        className="clock-digits h-16 w-20 rounded-xl border border-zinc-700/70 bg-zinc-900 text-center text-3xl font-semibold text-white transition-colors [appearance:textfield] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</span>
    </label>
  );
}

export function AddTimeSlotDialog({ mode, item, onSave, onCancel }: Props) {
  const initDuration = item?.duration ?? 600;
  const [label, setLabel] = useState(item?.label ?? (mode === "quick" ? "Timer" : ""));
  const [hours, setHours] = useState(Math.floor(initDuration / 3600));
  const [minutes, setMinutes] = useState(Math.floor((initDuration % 3600) / 60));
  const [seconds, setSeconds] = useState(initDuration % 60);
  const [direction, setDirection] = useState<"up" | "down">(item?.direction ?? "down");
  const [notes, setNotes] = useState(item?.notes ?? "");

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  const canSave = label.trim().length > 0 && totalSeconds > 0;

  function setFromMinutes(total: number) {
    setHours(Math.floor(total / 60));
    setMinutes(total % 60);
    setSeconds(0);
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSave) return;
    onSave({
      label: label.trim(),
      duration: totalSeconds,
      direction,
      notes: notes.trim() || undefined,
    });
  }

  const title = mode === "quick" ? "Quick timer" : mode === "edit" ? "Edit segment" : "Add segment";
  const saveLabel = mode === "quick" ? "Load timer" : mode === "edit" ? "Save changes" : "Add to schedule";

  return (
    <Modal
      title={title}
      onClose={onCancel}
      width="max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => submit()} disabled={!canSave}>
            {saveLabel}
          </Button>
        </div>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-400">Title</span>
          <input
            className={inputClass}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Sermon"
            autoFocus
            onFocus={(e) => e.target.select()}
          />
        </label>

        <div className="flex flex-col gap-3">
          <span className="text-xs font-medium text-zinc-400">
            {direction === "down" ? "Duration" : "Planned length"}
          </span>
          <div className="flex items-start justify-center gap-2">
            <TimeField value={hours} onChange={setHours} max={23} label="Hours" />
            <span className="clock-digits pt-3 text-3xl font-semibold text-zinc-600">:</span>
            <TimeField value={minutes} onChange={setMinutes} max={59} label="Min" />
            <span className="clock-digits pt-3 text-3xl font-semibold text-zinc-600">:</span>
            <TimeField value={seconds} onChange={setSeconds} max={59} label="Sec" />
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {PRESET_MINUTES.map((m) => {
              const selected = totalSeconds === m * 60;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setFromMinutes(m)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums transition-colors ${
                    selected
                      ? "border-brand bg-brand/15 text-white"
                      : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-100"
                  }`}
                >
                  {m < 60 ? `${m} min` : "1 hr"}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-400">Clock</span>
          <Segmented
            value={direction}
            onChange={setDirection}
            options={[
              { value: "down", label: <><ArrowDown size={14} /> Count down</> },
              { value: "up", label: <><ArrowUp size={14} /> Count up</> },
            ]}
          />
        </div>

        {mode !== "quick" && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-zinc-400">
              Operator notes <span className="text-zinc-600">(only you see these)</span>
            </span>
            <input
              className={inputClass}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Cue the band at 2 minutes"
            />
          </label>
        )}

        {/* Lets Enter submit from any field */}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
