import { useEffect, useRef, useState } from "react";
import { ChevronDown, MoreHorizontal, Plus, Upload, Download, Trash2, CalendarClock } from "lucide-react";
import type { ScheduleItem, TimerState } from "../types";
import type { useSchedule } from "../hooks/useSchedule";
import { ScheduleList } from "./ScheduleList";
import { inputClass } from "./ui";
import { formatHMS } from "../utils/timeFormat";

interface Props {
  schedule: ReturnType<typeof useSchedule>;
  timerState: TimerState;
  creating: boolean;
  setCreating: (v: boolean) => void;
  onLoadItem: (itemId: string, durationSeconds: number, label: string, direction: string) => void;
  onEditItem: (item: ScheduleItem) => void;
  onDeleteItem: (item: ScheduleItem) => void;
  onAddItem: () => void;
  onDeleteSchedule: () => void;
}

export function ScheduleSidebar({
  schedule,
  timerState,
  creating,
  setCreating,
  onLoadItem,
  onEditItem,
  onDeleteItem,
  onAddItem,
  onDeleteSchedule,
}: Props) {
  const [name, setName] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const active = schedule.activeSchedule;

  useEffect(() => {
    if (!menuOpen) return;
    function close(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);

  function create() {
    const n = name.trim();
    if (!n) return;
    schedule.createSchedule(n);
    setName("");
    setCreating(false);
  }

  const totalSeconds = active?.items.reduce((sum, i) => sum + i.duration, 0) ?? 0;

  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-950">
      {/* Schedule picker */}
      <div className="flex items-center gap-1.5 border-b border-zinc-800/80 p-3">
        <div className="relative min-w-0 flex-1">
          <CalendarClock size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <select
            value={schedule.activeScheduleId ?? ""}
            onChange={(e) => schedule.setActiveScheduleId(e.target.value)}
            className="h-9 w-full appearance-none truncate rounded-lg border border-zinc-800 bg-zinc-900 pl-8 pr-8 text-sm font-medium text-zinc-100 focus:border-brand focus:outline-none"
          >
            {schedule.schedules.length === 0 && <option value="">No schedules yet</option>}
            {schedule.schedules.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
        </div>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            title="Schedule options"
          >
            <MoreHorizontal size={18} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-10 z-30 w-48 animate-pop-in overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl shadow-black/50">
              <MenuItem icon={<Plus size={14} />} onClick={() => { setCreating(true); setMenuOpen(false); }}>
                New schedule
              </MenuItem>
              <MenuItem icon={<Upload size={14} />} onClick={() => { schedule.importSchedule(); setMenuOpen(false); }}>
                Import from file…
              </MenuItem>
              {active && (
                <>
                  <MenuItem icon={<Download size={14} />} onClick={() => { schedule.exportSchedule(active); setMenuOpen(false); }}>
                    Export to file…
                  </MenuItem>
                  <div className="my-1 border-t border-zinc-800" />
                  <MenuItem danger icon={<Trash2 size={14} />} onClick={() => { onDeleteSchedule(); setMenuOpen(false); }}>
                    Delete schedule
                  </MenuItem>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {creating && (
        <div className="flex flex-col gap-2 border-b border-zinc-800/80 bg-zinc-900/40 p-3">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
              if (e.key === "Escape") { setName(""); setCreating(false); }
            }}
            placeholder="Schedule name, e.g. Sunday Service"
            autoFocus
          />
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => { setName(""); setCreating(false); }}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={create}
              disabled={!name.trim()}
              className="rounded-md bg-brand px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-40"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-2">
        {active ? (
          <ScheduleList
            schedule={active}
            timerState={timerState}
            onLoadItem={onLoadItem}
            onEditItem={onEditItem}
            onDeleteItem={onDeleteItem}
            onReorder={(items) => schedule.reorderItems(active.id, items)}
            onAddClick={onAddItem}
          />
        ) : (
          !creating && (
            <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
              <p className="text-sm text-zinc-400">No schedule yet.</p>
              <p className="text-xs text-zinc-600">A schedule is the running order of your event.</p>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand-hover"
              >
                <Plus size={14} /> Create a schedule
              </button>
            </div>
          )
        )}
      </div>

      {active && active.items.length > 0 && (
        <div className="flex items-center justify-between border-t border-zinc-800/80 px-4 py-2.5 text-xs text-zinc-500">
          <span>{active.items.length} segment{active.items.length === 1 ? "" : "s"}</span>
          <span>
            Total <span className="font-medium tabular-nums text-zinc-300">{formatHMS(totalSeconds * 1000)}</span>
          </span>
        </div>
      )}
    </aside>
  );
}

function MenuItem({
  icon,
  children,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-zinc-800 ${
        danger ? "text-red-400" : "text-zinc-200"
      }`}
    >
      <span className="text-zinc-500">{icon}</span>
      {children}
    </button>
  );
}
