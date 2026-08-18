import { useState, useEffect, useRef } from "react";
import { parseTimeInput } from "../../utils/timeFormat";
import { useTimer } from "../../hooks/useTimer";
import { useSchedule } from "../../hooks/useSchedule";
import { TimerDisplay } from "../../components/TimerDisplay";
import { ControlBar } from "../../components/ControlBar";
import { ScheduleList } from "../../components/ScheduleList";
import { SettingsPanel } from "../../components/SettingsPanel";
import type { AppSettings } from "../../types";
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

type Tab = "timer" | "schedule" | "settings";

export function ControlApp() {
  const { state, start, pause, stop, reset, adjust, loadItem, setAllowOvertime } = useTimer();
  const schedule = useSchedule();
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [tab, setTab] = useState<Tab>("timer");
  const [durationInput, setDurationInput] = useState("10:00");
  const [direction, setDirection] = useState<"up" | "down">("down");

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  function handleSetTimer() {
    const seconds = parseTimeInput(durationInput);
    if (seconds > 0) {
      loadItem("manual", seconds, "Manual Timer");
    }
  }

  const tabBtn = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
      tab === t
        ? "bg-gray-900 text-white border-t border-l border-r border-gray-700"
        : "text-gray-500 hover:text-gray-300"
    }`;

  const activeSchedule = schedule.activeSchedule;

  // Auto-advance: when countdown reaches zero, load next schedule item (paused)
  const wasOvertime = useRef(false);
  useEffect(() => {
    if (!settings.autoAdvance) {
      wasOvertime.current = state.overtime;
      return;
    }
    if (!activeSchedule) return;

    const justReachedOvertime = state.overtime && !wasOvertime.current;
    wasOvertime.current = state.overtime;

    if (justReachedOvertime && state.direction === "down") {
      const currentIndex = activeSchedule.items.findIndex(
        (item) => item.id === state.active_item_id
      );
      const nextItem = activeSchedule.items[currentIndex + 1];
      if (nextItem) {
        loadItem(nextItem.id, nextItem.duration, nextItem.label);
      }
    }
  }, [state.overtime, state.active_item_id, state.direction, settings.autoAdvance, activeSchedule, loadItem]);

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
        <span
          className="text-sm font-bold tracking-widest uppercase"
          style={{ color: settings.brandColor }}
        >
          {settings.logoText}
        </span>
        <div className="flex items-center gap-1">
          {/* Schedule selector */}
          {schedule.schedules.length > 0 && (
            <select
              value={schedule.activeScheduleId ?? ""}
              onChange={(e) => schedule.setActiveScheduleId(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-md text-sm text-gray-300 px-2 py-1"
            >
              {schedule.schedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() =>
              schedule.createSchedule(
                prompt("Schedule name:") ?? "New Schedule"
              )
            }
            className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded"
          >
            + New
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div className="flex gap-1 px-4 pt-2 border-b border-gray-700 bg-gray-950 shrink-0">
        {(["timer", "schedule", "settings"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={tabBtn(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {tab === "timer" && (
          <div className="flex flex-col gap-6 p-6">
            {/* Timer display */}
            <div className="flex flex-col items-center py-6 bg-gray-900 rounded-2xl border border-gray-800">
              {state.label && (
                <p className="text-sm text-gray-400 mb-3 uppercase tracking-widest">
                  {state.label}
                </p>
              )}
              <TimerDisplay state={state} settings={settings} />
              <div className="mt-2 text-xs text-gray-600">
                {state.direction === "down" ? "Count Down" : "Count Up"}
                {state.running ? " · Running" : " · Paused"}
              </div>
            </div>

            {/* Manual time entry */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-gray-500 uppercase tracking-wider">
                Set Timer
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={durationInput}
                  onChange={(e) => setDurationInput(e.target.value)}
                  placeholder="mm:ss or hh:mm:ss"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as "up" | "down")}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300"
                >
                  <option value="down">↓ Down</option>
                  <option value="up">↑ Up</option>
                </select>
                <button
                  title={state.allow_overtime ? "Overtime ON — click to disable" : "Overtime OFF — click to enable"}
                  onClick={() => setAllowOvertime(!state.allow_overtime)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    state.allow_overtime
                      ? "bg-amber-900/50 border-amber-600 text-amber-400"
                      : "bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300"
                  }`}
                >
                  +OT
                </button>
                <button
                  onClick={handleSetTimer}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                >
                  Set
                </button>
              </div>
            </div>

            {/* Controls */}
            <ControlBar
              state={state}
              onStart={start}
              onPause={pause}
              onStop={stop}
              onReset={reset}
              onAdjust={adjust}
            />
          </div>
        )}

        {tab === "schedule" && (
          <div className="p-4 flex flex-col gap-3">
            {activeSchedule ? (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-gray-200">
                    {activeSchedule.name}
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => schedule.exportSchedule(activeSchedule)}
                      className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded transition-colors"
                    >
                      Export
                    </button>
                    <button
                      onClick={() => schedule.importSchedule()}
                      className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded transition-colors"
                    >
                      Import
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${activeSchedule.name}"?`)) {
                          schedule.deleteSchedule(activeSchedule.id);
                        }
                      }}
                      className="text-xs text-red-700 hover:text-red-400 px-2 py-1 rounded transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <ScheduleList
                  schedule={activeSchedule}
                  timerState={state}
                  onLoadItem={(id, dur, lbl) => loadItem(id, dur, lbl)}
                  onAddItem={(item) => schedule.addItem(activeSchedule.id, item)}
                  onUpdateItem={(item) =>
                    schedule.updateItem(activeSchedule.id, item)
                  }
                  onDeleteItem={(id) => schedule.deleteItem(activeSchedule.id, id)}
                  onReorder={(items) =>
                    schedule.reorderItems(activeSchedule.id, items)
                  }
                />
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 py-12 text-gray-600">
                <p>No schedules yet.</p>
                <button
                  onClick={() =>
                    schedule.createSchedule(
                      prompt("Schedule name:") ?? "New Schedule"
                    )
                  }
                  className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                >
                  Create Schedule
                </button>
              </div>
            )}
          </div>
        )}

        {tab === "settings" && (
          <SettingsPanel settings={settings} onUpdate={setSettings} />
        )}
      </main>
    </div>
  );
}
