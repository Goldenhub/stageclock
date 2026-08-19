import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTimer } from "../../hooks/useTimer";
import { useSchedule } from "../../hooks/useSchedule";
import { TimerDisplay } from "../../components/TimerDisplay";
import { ControlBar } from "../../components/ControlBar";
import { ScheduleList } from "../../components/ScheduleList";
import { SettingsPanel } from "../../components/SettingsPanel";
import { AddTimeSlotDialog } from "../../components/AddTimeSlotDialog";
import type { AppSettings, ScheduleItem } from "../../types";
import { DEFAULT_SETTINGS } from "../../types";

const SETTINGS_KEY = "event-timer-settings";

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as AppSettings;
  } catch {
    /* ignore */
  }
  return DEFAULT_SETTINGS;
}

type Tab = "timer" | "settings";

export function ControlApp() {
  const { state, start, pause, stop, reset, adjust, loadItem } = useTimer();
  const schedule = useSchedule();
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [tab, setTab] = useState<Tab>("timer");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [standaloneMode, setStandaloneMode] = useState(false);
  const [newScheduleName, setNewScheduleName] = useState("");
  const [creatingSchedule, setCreatingSchedule] = useState(false);
  const [live, setLive] = useState(false);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  // Auto-advance: when countdown reaches zero, load next schedule item (paused)
  const wasOvertime = useRef(false);
  useEffect(() => {
    if (!settings.autoAdvance) {
      wasOvertime.current = state.overtime;
      return;
    }
    const activeSchedule = schedule.activeSchedule;
    if (!activeSchedule) return;

    const justReachedOvertime = state.overtime && !wasOvertime.current;
    wasOvertime.current = state.overtime;

    if (justReachedOvertime && state.direction === "down") {
      const currentIndex = activeSchedule.items.findIndex(
        (item) => item.id === state.active_item_id
      );
      const nextItem = activeSchedule.items[currentIndex + 1];
      if (nextItem) {
        loadItem(nextItem.id, nextItem.duration, nextItem.label, nextItem.direction);
      }
    }
  }, [state.overtime, state.active_item_id, state.direction, settings.autoAdvance, schedule.activeSchedule, loadItem]);

  const activeSchedule = schedule.activeSchedule;

  function handleAddTimeSlot() {
    setEditingItem(null);
    setStandaloneMode(false);
    setDialogOpen(true);
  }

  function handleQuickTimer() {
    setEditingItem(null);
    setStandaloneMode(true);
    setDialogOpen(true);
  }

  function handleEditTimeSlot(item: ScheduleItem) {
    setEditingItem(item);
    setStandaloneMode(false);
    setDialogOpen(true);
  }

  function handleDialogSave(data: Omit<ScheduleItem, "id">) {
    if (standaloneMode) {
      loadItem(crypto.randomUUID(), data.duration, data.label, data.direction);
    } else if (editingItem) {
      schedule.updateItem(activeSchedule!.id, { ...editingItem, ...data });
    } else {
      schedule.addItem(activeSchedule!.id, data);
    }
    setDialogOpen(false);
    setEditingItem(null);
    setStandaloneMode(false);
  }

  function handleDialogCancel() {
    setDialogOpen(false);
    setEditingItem(null);
    setStandaloneMode(false);
  }

  function handleToggleLive() {
    invoke<boolean>("toggle_display").then(setLive).catch(console.error);
  }

  const tabBtn = (t: Tab) =>
    `px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
      tab === t
        ? "bg-gray-800 text-white"
        : "text-gray-500 hover:text-gray-300"
    }`;

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">
      {/* Header */}
      <header className="flex items-center px-4 py-2 border-b border-gray-800 shrink-0 gap-4">
        <span
          className="text-xs font-bold tracking-[0.2em] uppercase"
          style={{ color: "#6366f1" }}
        >
          STAGECLOCK
        </span>
        <div className="flex gap-1">
          {(["timer", "settings"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={tabBtn(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <button
            onClick={handleToggleLive}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              live
                ? "bg-red-600 hover:bg-red-500 text-white"
                : "bg-green-600 hover:bg-green-500 text-white"
            }`}
          >
            {live ? "■ End Live" : "▶ Go Live"}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left pane: Schedule */}
        <div className="w-72 border-r border-gray-800 flex flex-col shrink-0">
          {/* Schedule selector */}
          <div className="px-2 py-2 border-b border-gray-800 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <select
                value={schedule.activeScheduleId ?? ""}
                onChange={(e) => schedule.setActiveScheduleId(e.target.value)}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-md text-xs text-gray-300 px-2 py-1.5 truncate"
              >
                {schedule.schedules.length === 0 && (
                  <option value="">No schedules</option>
                )}
                {schedule.schedules.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setCreatingSchedule(true)}
                className="text-[10px] text-gray-500 hover:text-gray-300 px-1.5 py-1 rounded shrink-0"
              >
                + New
              </button>
              <button
                onClick={handleQuickTimer}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 bg-indigo-950 hover:bg-indigo-900 border border-indigo-800 px-1.5 py-1 rounded shrink-0 transition-colors"
              >
                ⚡ Quick
              </button>
            </div>
            {creatingSchedule && (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newScheduleName}
                  onChange={(e) => setNewScheduleName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newScheduleName.trim()) {
                      schedule.createSchedule(newScheduleName.trim());
                      setNewScheduleName("");
                      setCreatingSchedule(false);
                    }
                    if (e.key === "Escape") {
                      setNewScheduleName("");
                      setCreatingSchedule(false);
                    }
                  }}
                  placeholder="Schedule name…"
                  autoFocus
                  className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  onClick={() => {
                    if (newScheduleName.trim()) {
                      schedule.createSchedule(newScheduleName.trim());
                      setNewScheduleName("");
                      setCreatingSchedule(false);
                    }
                  }}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 px-1"
                >
                  ✓
                </button>
                <button
                  onClick={() => {
                    setNewScheduleName("");
                    setCreatingSchedule(false);
                  }}
                  className="text-[10px] text-gray-500 hover:text-gray-300 px-1"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Schedule list */}
          <div className="flex-1 overflow-y-auto p-2">
            <ScheduleList
              schedule={activeSchedule}
              timerState={state}
              onLoadItem={(id, dur, lbl, dir) => loadItem(id, dur, lbl, dir)}
              onEditItem={handleEditTimeSlot}
              onDeleteItem={(id) => schedule.deleteItem(activeSchedule!.id, id)}
              onReorder={(items) => schedule.reorderItems(activeSchedule!.id, items)}
              onAddClick={handleAddTimeSlot}
              onQuickTimer={handleQuickTimer}
            />
          </div>

          {/* Schedule actions */}
          {activeSchedule && (
            <div className="px-2 py-2 border-t border-gray-800 flex gap-1">
              <button
                onClick={() => schedule.exportSchedule(activeSchedule)}
                className="flex-1 text-[10px] text-gray-500 hover:text-gray-300 py-1 rounded transition-colors"
              >
                Export
              </button>
              <button
                onClick={() => schedule.importSchedule()}
                className="flex-1 text-[10px] text-gray-500 hover:text-gray-300 py-1 rounded transition-colors"
              >
                Import
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete "${activeSchedule.name}"?`)) {
                    schedule.deleteSchedule(activeSchedule.id);
                  }
                }}
                className="flex-1 text-[10px] text-red-700 hover:text-red-400 py-1 rounded transition-colors"
              >
                Delete
              </button>
            </div>
          )}
        </div>

        {/* Main area */}
        <div className="flex-1 overflow-y-auto">
          {tab === "timer" && (
            <div className="flex flex-col h-full p-6 gap-4">
              {/* Timer display — centered */}
              <div className="flex-1 flex flex-col items-center justify-center gap-2">
                {state.label && (
                  <p className="text-sm text-gray-400 uppercase tracking-widest">
                    {state.label}
                  </p>
                )}
                <TimerDisplay state={state} settings={settings} />
                <div className="mt-1 text-xs text-gray-600">
                  {state.direction === "down" ? "Count Down" : "Count Up"}
                  {state.running ? " · Running" : " · Paused"}
                </div>
              </div>

              {/* Controls */}
              <div className="max-w-md mx-auto w-full">
                <ControlBar
                  state={state}
                  onStart={start}
                  onPause={pause}
                  onStop={stop}
                  onReset={reset}
                  onAdjust={adjust}
                />
              </div>
            </div>
          )}

          {tab === "settings" && (
            <SettingsPanel settings={settings} onUpdate={setSettings} />
          )}
        </div>
      </div>

      {/* Add/Edit Time Slot Dialog */}
      {dialogOpen && (
        <AddTimeSlotDialog
          item={editingItem ?? undefined}
          onSave={handleDialogSave}
          onCancel={handleDialogCancel}
        />
      )}
    </div>
  );
}
