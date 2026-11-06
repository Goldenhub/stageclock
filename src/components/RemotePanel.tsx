import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle, WifiOff } from "lucide-react";
import type { AppSettings } from "../types";
import { QRCode } from "./QRCode";
import { Modal, SectionLabel, inputClass } from "./ui";

interface Props {
  settings: AppSettings;
  onUpdate: (settings: AppSettings) => void;
  onClose: () => void;
}

/** QR code and PIN for controlling the clock from a phone. */
export function RemotePanel({ settings, onUpdate, onClose }: Props) {
  const [localIp, setLocalIp] = useState<string | null | undefined>(undefined);
  // undefined = loading, null = server couldn't start
  const [port, setPort] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    invoke<string>("get_local_ip").then(setLocalIp).catch(() => setLocalIp(null));
    invoke<number | null>("get_remote_port").then(setPort).catch(() => setPort(null));
  }, []);

  const url = localIp && port ? `http://${localIp}:${port}/mobile` : "";

  return (
    <Modal title="Phone remote" onClose={onClose} width="max-w-sm">
      <div className="flex flex-col gap-6">
        {port === null ? (
          <Notice icon={<AlertTriangle size={16} />} tone="red" title="Phone remote unavailable">
            Ports 3000–3010 are all in use by other apps. Close them and restart StageClock.
          </Notice>
        ) : localIp === null ? (
          <Notice icon={<WifiOff size={16} />} tone="amber" title="Not on a network">
            Connect this computer to Wi-Fi, then reopen this window.
          </Notice>
        ) : url ? (
          <div className="flex flex-col items-center gap-3">
            <QRCode url={url} size={180} />
            <p className="text-center text-xs text-zinc-500">
              Scan with a phone on the <span className="text-zinc-300">same Wi-Fi</span> to start, pause and
              adjust the clock, load segments and send messages.
            </p>
          </div>
        ) : (
          <div className="h-60" />
        )}

        <section className="flex flex-col gap-2">
          <SectionLabel>Remote PIN</SectionLabel>
          <input
            type="text"
            inputMode="numeric"
            maxLength={8}
            value={settings.pin}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "").slice(0, 8);
              onUpdate({ ...settings, pin: val });
              if (val.length >= 4) invoke("set_pin", { pin: val }).catch(console.error);
            }}
            className={`${inputClass} text-center font-mono text-lg tracking-[0.4em]`}
          />
          <p className={`text-xs ${settings.pin.length < 4 ? "text-amber-400" : "text-zinc-500"}`}>
            {settings.pin.length < 4
              ? "Use at least 4 digits. The old PIN stays active until then."
              : "Phones ask for this PIN once."}
          </p>
        </section>
      </div>
    </Modal>
  );
}

function Notice({
  icon,
  tone,
  title,
  children,
}: {
  icon: React.ReactNode;
  tone: "red" | "amber";
  title: string;
  children: React.ReactNode;
}) {
  const cls =
    tone === "red"
      ? "border-red-900/70 bg-red-950/40 text-red-200"
      : "border-amber-900/70 bg-amber-950/30 text-amber-200";
  return (
    <div className={`flex gap-3 rounded-lg border px-3 py-3 ${cls}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs opacity-80">{children}</span>
      </div>
    </div>
  );
}
