import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { Monitor } from "lucide-react";
import type { AppSettings } from "../types";
import { Modal, SectionLabel, Toggle, inputClass } from "./ui";

interface Props {
  settings: AppSettings;
  onUpdate: (settings: AppSettings) => void;
  onClose: () => void;
}

interface DisplayInfo {
  index: number;
  name: string;
  width: number;
  height: number;
}

export function SettingsPanel({ settings, onUpdate, onClose }: Props) {
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [version, setVersion] = useState("");

  useEffect(() => {
    invoke<DisplayInfo[]>("get_displays").then(setDisplays).catch(console.error);
    getVersion().then(setVersion).catch(() => {});
  }, []);

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    onUpdate({ ...settings, [key]: value });
  }

  function setThreshold(key: keyof AppSettings["alertThresholds"], value: number) {
    onUpdate({
      ...settings,
      alertThresholds: { ...settings.alertThresholds, [key]: Math.max(0, value) },
    });
  }

  return (
    <Modal
      title="Settings"
      onClose={onClose}
      footer={<p className="text-center text-[11px] text-zinc-600">StageClock {version && `v${version}`}</p>}
    >
      <div className="flex flex-col gap-7">
        {/* Stage screen */}
        <section className="flex flex-col gap-3">
          <SectionLabel>Stage screen</SectionLabel>
          {displays.length > 1 ? (
            <div className="flex flex-col gap-1.5">
              {displays.map((d) => {
                const selected = (settings.secondaryMonitorIndex ?? 1) === d.index;
                return (
                  <button
                    key={d.index}
                    type="button"
                    onClick={() => {
                      set("secondaryMonitorIndex", d.index);
                      invoke("move_display_window_to_monitor", { monitorIndex: d.index }).catch(console.error);
                    }}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      selected
                        ? "border-brand bg-brand/10"
                        : "border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900"
                    }`}
                  >
                    <Monitor size={18} className={selected ? "text-brand-hover" : "text-zinc-500"} />
                    <span className="flex flex-1 flex-col">
                      <span className="text-sm text-zinc-100">
                        {d.name || `Display ${d.index + 1}`}
                        {d.index === 0 && <span className="ml-2 text-xs text-zinc-500">(main)</span>}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {d.width} × {d.height}
                      </span>
                    </span>
                    {selected && <span className="text-xs font-semibold text-brand-hover">Stage</span>}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="rounded-lg border border-zinc-800 px-3 py-2.5 text-xs text-zinc-500">
              Only one display is connected. Plug in a projector or TV to put the clock on its own screen.
            </p>
          )}
        </section>

        {/* Alerts */}
        <section className="flex flex-col gap-3">
          <SectionLabel>Countdown colors</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                <span className="h-2 w-2 rounded-full bg-amber-400" /> Amber at (seconds left)
              </span>
              <input
                type="number"
                min={0}
                className={inputClass}
                value={settings.alertThresholds.warningSeconds}
                onChange={(e) => setThreshold("warningSeconds", Number(e.target.value))}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                <span className="h-2 w-2 rounded-full bg-red-500" /> Red at (seconds left)
              </span>
              <input
                type="number"
                min={0}
                className={inputClass}
                value={settings.alertThresholds.criticalSeconds}
                onChange={(e) => setThreshold("criticalSeconds", Number(e.target.value))}
              />
            </label>
          </div>
        </section>

        {/* Behaviour */}
        <section className="flex flex-col gap-4">
          <SectionLabel>Behavior</SectionLabel>
          <Toggle
            checked={settings.showNextItem}
            onChange={(v) => set("showNextItem", v)}
            label="Show the next segment on stage"
            hint="Displays “Next · …” under the clock."
          />
          <Toggle
            checked={settings.autoAdvance}
            onChange={(v) => set("autoAdvance", v)}
            label="Auto-advance"
            hint="When a countdown ends, load the next segment (paused)."
          />
        </section>
      </div>
    </Modal>
  );
}
