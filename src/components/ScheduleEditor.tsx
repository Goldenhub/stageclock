import { useState } from "react";
import type { ScheduleItem } from "../types";
import { parseTimeInput, secondsToInputValue } from "../utils/timeFormat";

interface Props {
  item?: ScheduleItem;
  onSave: (item: Omit<ScheduleItem, "id">) => void;
  onCancel: () => void;
}

export function ScheduleEditor({ item, onSave, onCancel }: Props) {
  const [label, setLabel] = useState(item?.label ?? "");
  const [durationStr, setDurationStr] = useState(
    item ? secondsToInputValue(item.duration) : "10:00"
  );
  const [notes, setNotes] = useState(item?.notes ?? "");

  const input =
    "w-full bg-gray-800 border border-gray-600 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    onSave({
      label: label.trim(),
      duration: parseTimeInput(durationStr),
      notes: notes.trim() || undefined,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex flex-col gap-3"
    >
      <h3 className="text-sm font-semibold text-gray-300">
        {item ? "Edit Item" : "New Item"}
      </h3>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-400">Label</label>
        <input
          className={input}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Opening Prayer"
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-400">Duration (mm:ss or hh:mm:ss)</label>
        <input
          className={input}
          value={durationStr}
          onChange={(e) => setDurationStr(e.target.value)}
          placeholder="10:00"
        />
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
  );
}
