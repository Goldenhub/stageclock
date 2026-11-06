import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { TimerState, AppSettings } from "../../types";
import { DEFAULT_TIMER_STATE, DEFAULT_SETTINGS } from "../../types";
import { StageView } from "../../components/StageView";

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

export function DisplayApp() {
  const [state, setState] = useState<TimerState>(DEFAULT_TIMER_STATE);
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  useEffect(() => {
    const unlistenState = listen<TimerState>("timer-state-updated", (event) => {
      setState(event.payload);
    });
    // The control window broadcasts settings whenever they change.
    const unlistenSettings = listen<AppSettings>("settings-updated", (event) => {
      setSettings({ ...DEFAULT_SETTINGS, ...event.payload });
    });
    return () => {
      unlistenState.then((fn) => fn());
      unlistenSettings.then((fn) => fn());
    };
  }, []);

  // Drag the frameless window from its top strip; double-click toggles fullscreen.
  const handleMouseDown = useCallback(async (e: React.MouseEvent) => {
    if (e.clientY > 48) return;
    if (e.detail === 2) {
      const win = getCurrentWindow();
      await win.setFullscreen(!(await win.isFullscreen()));
    } else {
      e.preventDefault();
      getCurrentWindow().startDragging();
    }
  }, []);

  return (
    <div className="h-screen w-screen cursor-default" onMouseDown={handleMouseDown}>
      <StageView state={state} settings={settings} />
    </div>
  );
}
