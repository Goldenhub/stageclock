import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Schedule, ScheduleItem } from "../types";

const STORAGE_KEY = "event-timer-schedules";

function loadFromStorage(): Schedule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Schedule[];
  } catch {
    /* ignore */
  }
  return [];
}

function saveToStorage(schedules: Schedule[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schedules));
}

export function useSchedule() {
  const [schedules, setSchedules] = useState<Schedule[]>(() =>
    loadFromStorage()
  );
  const [activeScheduleId, setActiveScheduleId] = useState<string | null>(
    () => schedules[0]?.id ?? null
  );

  const activeSchedule = schedules.find((s) => s.id === activeScheduleId) ?? null;

  useEffect(() => {
    saveToStorage(schedules);
  }, [schedules]);

  // Push active schedule items to Rust backend for mobile remote & display
  useEffect(() => {
    if (activeSchedule) {
      const items = activeSchedule.items.map((i) => ({
        id: i.id,
        label: i.label,
        duration_seconds: i.duration,
      }));
      invoke("set_schedule", { items }).catch(console.error);
    } else {
      invoke("set_schedule", { items: [] }).catch(console.error);
    }
  }, [activeSchedule]);

  const createSchedule = useCallback((name: string): Schedule => {
    const schedule: Schedule = {
      id: crypto.randomUUID(),
      name,
      items: [],
    };
    setSchedules((prev) => [...prev, schedule]);
    setActiveScheduleId(schedule.id);
    return schedule;
  }, []);

  const updateSchedule = useCallback((updated: Schedule) => {
    setSchedules((prev) =>
      prev.map((s) => (s.id === updated.id ? updated : s))
    );
  }, []);

  const deleteSchedule = useCallback((id: string) => {
    setSchedules((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (activeScheduleId === id) {
        setActiveScheduleId(next[0]?.id ?? null);
      }
      return next;
    });
  }, [activeScheduleId]);

  const addItem = useCallback(
    (scheduleId: string, item: Omit<ScheduleItem, "id">) => {
      const newItem: ScheduleItem = { ...item, id: crypto.randomUUID() };
      setSchedules((prev) =>
        prev.map((s) =>
          s.id === scheduleId ? { ...s, items: [...s.items, newItem] } : s
        )
      );
    },
    []
  );

  const updateItem = useCallback(
    (scheduleId: string, updated: ScheduleItem) => {
      setSchedules((prev) =>
        prev.map((s) =>
          s.id === scheduleId
            ? { ...s, items: s.items.map((i) => (i.id === updated.id ? updated : i)) }
            : s
        )
      );
    },
    []
  );

  const deleteItem = useCallback((scheduleId: string, itemId: string) => {
    setSchedules((prev) =>
      prev.map((s) =>
        s.id === scheduleId
          ? { ...s, items: s.items.filter((i) => i.id !== itemId) }
          : s
      )
    );
  }, []);

  const reorderItems = useCallback(
    (scheduleId: string, items: ScheduleItem[]) => {
      setSchedules((prev) =>
        prev.map((s) => (s.id === scheduleId ? { ...s, items } : s))
      );
    },
    []
  );

  const exportSchedule = useCallback(async (schedule: Schedule) => {
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      const path = await save({
        defaultPath: `${schedule.name.replace(/\s+/g, "-")}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (path) {
        await writeTextFile(path, JSON.stringify(schedule, null, 2));
      }
    } catch (e) {
      console.error("Export failed:", e);
    }
  }, []);

  const importSchedule = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const path = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (typeof path === "string") {
        const content = await readTextFile(path);
        const schedule = JSON.parse(content) as Schedule;
        schedule.id = crypto.randomUUID();
        setSchedules((prev) => [...prev, schedule]);
        setActiveScheduleId(schedule.id);
      }
    } catch (e) {
      console.error("Import failed:", e);
    }
  }, []);

  return {
    schedules,
    activeSchedule,
    activeScheduleId,
    setActiveScheduleId,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    addItem,
    updateItem,
    deleteItem,
    reorderItems,
    exportSchedule,
    importSchedule,
  };
}
