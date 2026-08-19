import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppSettings } from "../types";
import { QRCode } from "./QRCode";

interface Props {
  settings: AppSettings;
  onUpdate: (settings: AppSettings) => void;
}

const input =
  "w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export function SettingsPanel({ settings, onUpdate }: Props) {
  const [localIp, setLocalIp] = useState<string>("");
  const [displays, setDisplays] = useState<
    { index: number; name: string; width: number; height: number }[]
  >([]);

  useEffect(() => {
    invoke<string>("get_local_ip")
      .then(setLocalIp)
      .catch(() => setLocalIp("unavailable"));

    invoke<{ index: number; name: string; width: number; height: number }[]>(
      "get_displays"
    )
      .then(setDisplays)
      .catch(console.error);
  }, []);

  const mobileUrl = localIp && localIp !== "unavailable"
    ? `http://${localIp}:3000/mobile`
    : "";

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    onUpdate({ ...settings, [key]: value });
  }

  function setThreshold(
    key: keyof AppSettings["alertThresholds"],
    value: number
  ) {
    onUpdate({
      ...settings,
      alertThresholds: { ...settings.alertThresholds, [key]: value },
    });
  }

  return (
    <div className="flex flex-col gap-5 p-4 text-sm">
      <h2 className="text-base font-semibold text-gray-200">Settings</h2>

      {/* QR Code */}
      {mobileUrl && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Phone Remote
          </h3>
          <QRCode url={mobileUrl} />
          <p className="text-xs text-gray-500 text-center">
            Scan to open remote control on any phone
          </p>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Remote PIN</label>
            <input
              type="text"
              maxLength={8}
              value={settings.pin}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 8);
                set("pin", val);
                invoke("set_pin", { pin: val }).catch(console.error);
              }}
              placeholder="1234"
              className={input}
            />
          </div>
        </section>
      )}

      {/* Display monitor */}
      {displays.length > 1 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Display Monitor
          </h3>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-500">Primary (Control)</label>
            <div className="w-full bg-gray-900 border border-gray-700 rounded-md text-xs text-gray-400 px-2 py-1.5">
              Monitor 1 — {displays[0]?.name} ({displays[0]?.width}×{displays[0]?.height})
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-500">Secondary (Display)</label>
            <select
              value={settings.secondaryMonitorIndex ?? 1}
              onChange={(e) => {
                const idx = Number(e.target.value);
                onUpdate({ ...settings, secondaryMonitorIndex: idx });
                invoke("move_display_window_to_monitor", { monitorIndex: idx }).catch(console.error);
              }}
              className="w-full bg-gray-800 border border-gray-700 rounded-md text-xs text-gray-300 px-2 py-1.5"
            >
              {displays.map((d) => (
                <option key={d.index} value={d.index}>
                  Monitor {d.index + 1} — {d.name} ({d.width}×{d.height})
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      {/* Alert thresholds */}
      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Alert Thresholds
        </h3>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">
            Warning at (seconds remaining)
          </label>
          <input
            type="number"
            min={0}
            className={input}
            value={settings.alertThresholds.warningSeconds}
            onChange={(e) =>
              setThreshold("warningSeconds", Number(e.target.value))
            }
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">
            Critical at (seconds remaining)
          </label>
          <input
            type="number"
            min={0}
            className={input}
            value={settings.alertThresholds.criticalSeconds}
            onChange={(e) =>
              setThreshold("criticalSeconds", Number(e.target.value))
            }
          />
        </div>
      </section>

      {/* Display options */}
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Display Options
        </h3>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.showNextItem}
            onChange={(e) => set("showNextItem", e.target.checked)}
            className="rounded"
          />
          <span className="text-gray-300">Show next item</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.autoAdvance}
            onChange={(e) => set("autoAdvance", e.target.checked)}
            className="rounded"
          />
          <span className="text-gray-300">Auto-advance to next item</span>
        </label>
      </section>

      {/* PIN */}
    </div>
  );
}
