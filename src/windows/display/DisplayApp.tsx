import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { TimerState, AppSettings } from "../../types";
import { DEFAULT_TIMER_STATE, DEFAULT_SETTINGS } from "../../types";
import { TimerDisplay } from "../../components/TimerDisplay";
import { getColorState } from "../../utils/timerMath";
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
              color: "#6366f1",
              fontSize: "clamp(1rem, 2.5vw, 2rem)",
            }}
          >
            STAGECLOCK
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

      {/* Banner overlay — lower-third */}
      {state.banner_text && (
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center py-6 px-8"
             style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.85) 60%)" }}>
          <div className="bg-black/70 backdrop-blur-sm border border-white/10 rounded-xl px-10 py-4 max-w-[80vw]">
            <p className="text-white/90 text-center font-medium whitespace-nowrap"
               style={{ fontSize: "clamp(1rem, 2.5vw, 1.75rem)" }}>
              {state.banner_text}
            </p>
          </div>
        </div>
      )}

      {/* Logo watermark — bottom-right */}
      <img
        src={logoUrl}
        alt=""
        className="absolute bottom-4 right-5 opacity-15 pointer-events-none"
        style={{ height: "clamp(24px, 3vw, 48px)" }}
      />
    </div>
  );
}
