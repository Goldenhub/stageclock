import { useEffect, useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { ask } from "@tauri-apps/plugin-dialog";
import { Settings, Smartphone, Zap, Cast, SkipForward, ArrowDown, ArrowUp, StickyNote } from "lucide-react";
import { useTimer } from "../../hooks/useTimer";
import { useSchedule } from "../../hooks/useSchedule";
import { ControlBar } from "../../components/ControlBar";
import { ScheduleSidebar } from "../../components/ScheduleSidebar";
import { SettingsPanel } from "../../components/SettingsPanel";
import { RemotePanel } from "../../components/RemotePanel";
import { AddTimeSlotDialog } from "../../components/AddTimeSlotDialog";
import { LivePreview, LiveBadge } from "../../components/LivePreview";
import { StageMessage } from "../../components/StageMessage";
import { Button, Kbd, Panel, SectionLabel } from "../../components/ui";
import { checkForUpdates } from "../../updater";
import { formatHMS } from "../../utils/timeFormat";
import type { AppSettings, ScheduleItem } from "../../types";
import { DEFAULT_SETTINGS } from "../../types";
import logoUrl from "../../assets/logo.png";

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

type DialogState =
  | { kind: "none" }
  | { kind: "add" }
  | { kind: "edit"; item: ScheduleItem }
  | { kind: "quick" }
  | { kind: "settings" }
  | { kind: "remote" };

export function ControlApp() {
  const { state, start, pause, stop, reset, adjust, loadItem, setAllowOvertime } = useTimer();
  const schedule = useSchedule();
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [creatingSchedule, setCreatingSchedule] = useState(false);
  const [live, setLive] = useState(false);

  const activeSchedule = schedule.activeSchedule;
  const hasItem = state.active_item_id !== null;

  // Persist settings and push them to the stage display and phone remote,
  // so changes take effect there immediately instead of after a restart.
  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    emit("settings-updated", settings).catch(console.error);
    invoke("set_alert_thresholds", {
      warningSeconds: settings.alertThresholds.warningSeconds,
      criticalSeconds: settings.alertThresholds.criticalSeconds,
    }).catch(console.error);
  }, [settings]);

  useEffect(() => {
    checkForUpdates();
    invoke<boolean>("is_display_visible").then(setLive).catch(() => {});
  }, []);

  // Always keep the display window on the chosen monitor
  useEffect(() => {
    invoke("move_display_window_to_monitor", {
      monitorIndex: settings.secondaryMonitorIndex,
    }).catch(console.error);
  }, [settings.secondaryMonitorIndex]);

  // Auto-advance: when a countdown reaches zero, load the next item (paused)
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
      const currentIndex = activeSchedule.items.findIndex((item) => item.id === state.active_item_id);
      const nextItem = activeSchedule.items[currentIndex + 1];
      if (nextItem) {
        loadItem(nextItem.id, nextItem.duration, nextItem.label, nextItem.direction);
      }
    }
  }, [state.overtime, state.active_item_id, state.direction, settings.autoAdvance, activeSchedule, loadItem]);

  // ── Derived schedule info ─────────────────────────────────────────────────
  const items = activeSchedule?.items ?? [];
  const activeIndex = items.findIndex((i) => i.id === state.active_item_id);
  const currentItem = activeIndex >= 0 ? items[activeIndex] : null;
  const nextItem = activeIndex >= 0 ? items[activeIndex + 1] ?? null : items[0] ?? null;

  // ── Actions ───────────────────────────────────────────────────────────────

  // Loading an item replaces what's on the stage, so ask first if a timer is
  // running. Clicking the running item itself would otherwise reset it.
  const handleLoadItem = useCallback(
    async (id: string, duration: number, label: string, direction: string) => {
      if (state.running) {
        const ok = await ask(
          `"${state.label ?? "The current timer"}" is running on the stage.\n\nReplace it with "${label}"?`,
          { title: "Replace running timer?", kind: "warning", okLabel: "Replace", cancelLabel: "Keep running" }
        );
        if (!ok) return;
      }
      loadItem(id, duration, label, direction);
    },
    [state.running, state.label, loadItem]
  );

  const loadNext = useCallback(() => {
    if (nextItem) handleLoadItem(nextItem.id, nextItem.duration, nextItem.label, nextItem.direction);
  }, [nextItem, handleLoadItem]);

  async function handleDeleteItem(item: ScheduleItem) {
    const ok = await ask(`Delete "${item.label}" from this schedule?`, {
      title: "Delete segment?",
      kind: "warning",
      okLabel: "Delete",
      cancelLabel: "Cancel",
    });
    if (ok && activeSchedule) schedule.deleteItem(activeSchedule.id, item.id);
  }

  async function handleDeleteSchedule() {
    if (!activeSchedule) return;
    const ok = await ask(`Delete the schedule "${activeSchedule.name}" and all its segments?`, {
      title: "Delete schedule?",
      kind: "warning",
      okLabel: "Delete",
      cancelLabel: "Cancel",
    });
    if (ok) schedule.deleteSchedule(activeSchedule.id);
  }

  function handleDialogSave(data: Omit<ScheduleItem, "id">) {
    if (dialog.kind === "quick") {
      handleLoadItem(crypto.randomUUID(), data.duration, data.label, data.direction);
    } else if (dialog.kind === "edit" && activeSchedule) {
      const editing = dialog.item;
      schedule.updateItem(activeSchedule.id, { ...editing, ...data });
      // Keep the stage in sync if this item is the one on the clock.
      if (editing.id === state.active_item_id) {
        invoke("update_active_item", {
          itemId: editing.id,
          label: data.label,
          durationSeconds: data.duration,
          direction: data.direction,
        }).catch(console.error);
      }
    } else if (dialog.kind === "add" && activeSchedule) {
      schedule.addItem(activeSchedule.id, data);
    }
    setDialog({ kind: "none" });
  }

  function handleToggleLive() {
    invoke<boolean>("toggle_display", { monitorIndex: settings.secondaryMonitorIndex })
      .then(setLive)
      .catch(console.error);
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (dialog.kind !== "none" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true]")) return;

      if (e.code === "Space" && hasItem) {
        e.preventDefault();
        // Don't let Space also "click" whichever button has focus.
        if (t instanceof HTMLButtonElement) t.blur();
        if (state.running) pause();
        else start();
      } else if (e.key.toLowerCase() === "n" && nextItem) {
        e.preventDefault();
        loadNext();
      } else if ((e.key === "+" || e.key === "=") && hasItem) {
        adjust(60);
      } else if (e.key === "-" && hasItem) {
        adjust(-60);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog.kind, hasItem, state.running, nextItem, start, pause, adjust, loadNext]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-800/80 px-4">
        <img src={logoUrl} alt="" className="h-7 w-7 rounded-md" />
        <span className="text-sm font-bold tracking-tight">StageClock</span>

        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "quick" })}>
            <Zap size={14} /> Quick timer
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "remote" })}>
            <Smartphone size={14} /> Phone remote
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "settings" })} aria-label="Settings">
            <Settings size={15} />
          </Button>
          <div className="mx-1.5 h-6 w-px bg-zinc-800" />
          <Button
            size="sm"
            variant={live ? "danger" : "secondary"}
            onClick={handleToggleLive}
            className="min-w-[132px]"
            title={live ? "Hide the stage screen" : "Show the clock on the stage screen"}
          >
            {live ? (
              <>
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> Live · End
              </>
            ) : (
              <>
                <Cast size={14} /> Go live
              </>
            )}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <ScheduleSidebar
          schedule={schedule}
          timerState={state}
          creating={creatingSchedule}
          setCreating={setCreatingSchedule}
          onLoadItem={handleLoadItem}
          onEditItem={(item) => setDialog({ kind: "edit", item })}
          onDeleteItem={handleDeleteItem}
          onAddItem={() => setDialog({ kind: "add" })}
          onDeleteSchedule={handleDeleteSchedule}
        />

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto grid max-w-[1400px] gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            {/* Left: what's on stage + controls */}
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex min-h-[52px] items-end justify-between gap-4">
                <div className="min-w-0">
                  <SectionLabel>{state.running ? "On air now" : hasItem ? "Loaded" : "Nothing loaded"}</SectionLabel>
                  <h2 className="mt-1 truncate text-xl font-semibold tracking-tight">
                    {state.label ?? <span className="text-zinc-600">Pick a segment or start a quick timer</span>}
                  </h2>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {hasItem && (
                    <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                      {state.direction === "down" ? <ArrowDown size={13} /> : <ArrowUp size={13} />}
                      {state.direction === "down" ? "Countdown" : "Count up"}
                      {state.duration_ms > 0 && <> · {formatHMS(state.duration_ms)}</>}
                    </span>
                  )}
                  <LiveBadge live={live} />
                </div>
              </div>

              <LivePreview state={state} settings={settings} live={live} />

              {currentItem?.notes && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-sm text-amber-100/90">
                  <StickyNote size={15} className="mt-0.5 shrink-0 text-amber-400/80" />
                  {currentItem.notes}
                </div>
              )}

              <Panel className="p-4">
                {hasItem ? (
                  <ControlBar
                    state={state}
                    onStart={start}
                    onPause={pause}
                    onStop={stop}
                    onReset={reset}
                    onAdjust={adjust}
                    onAllowOvertime={setAllowOvertime}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 py-6 text-center">
                    <p className="text-sm text-zinc-400">
                      Click a segment in the schedule to load it, or start a one-off timer.
                    </p>
                    <Button variant="primary" onClick={() => setDialog({ kind: "quick" })}>
                      <Zap size={15} /> Quick timer
                    </Button>
                  </div>
                )}
              </Panel>
            </div>

            {/* Right: up next + message */}
            <div className="flex min-w-0 flex-col gap-4 xl:pt-[68px]">
              <Panel className="flex flex-col gap-3 p-4">
                <SectionLabel>Up next</SectionLabel>
                {nextItem ? (
                  <>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-base font-semibold">{nextItem.label}</span>
                      <span className="shrink-0 text-sm tabular-nums text-zinc-500">
                        {formatHMS(nextItem.duration * 1000)}
                      </span>
                    </div>
                    <Button onClick={loadNext} className="w-full">
                      <SkipForward size={15} /> Load next
                      <span className="ml-1"><Kbd>N</Kbd></span>
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-zinc-600">
                    {activeSchedule ? "End of schedule." : "No schedule selected."}
                  </p>
                )}
              </Panel>

              <StageMessage current={state.banner_text} />

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-[11px] text-zinc-600">
                <span className="flex items-center gap-1.5"><Kbd>Space</Kbd> start / pause</span>
                <span className="flex items-center gap-1.5"><Kbd>+</Kbd><Kbd>−</Kbd> 1 min</span>
                <span className="flex items-center gap-1.5"><Kbd>N</Kbd> load next</span>
              </div>
            </div>
          </div>
        </main>
      </div>

      {(dialog.kind === "add" || dialog.kind === "edit" || dialog.kind === "quick") && (
        <AddTimeSlotDialog
          mode={dialog.kind}
          item={dialog.kind === "edit" ? dialog.item : undefined}
          onSave={handleDialogSave}
          onCancel={() => setDialog({ kind: "none" })}
        />
      )}
      {dialog.kind === "settings" && (
        <SettingsPanel settings={settings} onUpdate={setSettings} onClose={() => setDialog({ kind: "none" })} />
      )}
      {dialog.kind === "remote" && (
        <RemotePanel settings={settings} onUpdate={setSettings} onClose={() => setDialog({ kind: "none" })} />
      )}
    </div>
  );
}
