import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { TimerState, AppSettings } from "../../types";
import { DEFAULT_TIMER_STATE, DEFAULT_SETTINGS } from "../../types";
import { TimerDisplay } from "../../components/TimerDisplay";
import { getColorState } from "../../utils/timerMath";

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
  const [settings] = useState<AppSettings>(loadSettings);

  useEffect(() => {
    const unlisten = listen<TimerState>("timer-state-updated", (event) => {
      setState(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const colorState = getColorState(state, settings);
  const bgColor =
    colorState === "normal"
      ? "#030712"
      : colorState === "warning"
      ? "#030712"
      : "#0a0101";

  return (
    <div
      className="flex flex-col h-screen w-screen select-none overflow-hidden transition-colors duration-500"
      style={{ background: bgColor }}
    >
      {/* Top: current item label */}
      <div className="flex-1 flex items-end justify-center pb-6 px-8">
        {state.label ? (
          <h1
            className="text-2xl font-semibold tracking-wide text-center text-white/80"
            style={{ fontSize: "clamp(1.25rem, 3vw, 2.5rem)" }}
          >
            {state.label}
          </h1>
        ) : (
          <h1
            className="text-2xl font-bold tracking-[0.3em] uppercase text-center opacity-20"
            style={{
              color: settings.brandColor,
              fontSize: "clamp(1rem, 2.5vw, 2rem)",
            }}
          >
            {settings.logoText}
          </h1>
        )}
      </div>

      {/* Center: clock */}
      <div className="flex items-center justify-center py-4">
        <TimerDisplay state={state} settings={settings} large />
      </div>

      {/* Bottom: next item */}
      <div className="flex-1 flex items-start justify-center pt-6 px-8">
        {state.next_item_label && state.label && settings.showNextItem && (
          <p className="text-white/30 text-sm uppercase tracking-widest">
            Next: {state.next_item_label}
          </p>
        )}
      </div>
    </div>
  );
}
