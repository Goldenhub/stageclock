import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { AlertTriangle, WifiOff, ShieldCheck, Copy, Check, Unplug } from "lucide-react";
import { QRCode } from "./QRCode";
import { Button, Modal, SectionLabel } from "./ui";

interface RemoteInfo {
  url: string | null;
  port: number | null;
  ip: string | null;
  connected: number;
}

interface Props {
  onClose: () => void;
}

/** QR-code pairing for controlling the clock from a phone. */
export function RemotePanel({ onClose }: Props) {
  // undefined = still loading
  const [info, setInfo] = useState<RemoteInfo | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(() => {
    invoke<RemoteInfo>("get_remote_info")
      .then(setInfo)
      .catch(() => setInfo({ url: null, port: null, ip: null, connected: 0 }));
  }, []);

  // Refresh while open so the "phones connected" count stays current.
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [refresh]);

  async function disconnectAll() {
    const ok = await ask(
      "Every paired phone will be disconnected immediately and the old QR code will stop working. Phones you still want to use must scan the new code.",
      { title: "Disconnect all phones?", kind: "warning", okLabel: "Disconnect all", cancelLabel: "Cancel" }
    );
    if (!ok) return;
    invoke<RemoteInfo>("reset_remote_access").then(setInfo).catch(console.error);
  }

  async function copyLink() {
    if (!info?.url) return;
    try {
      await navigator.clipboard.writeText(info.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  const baseUrl = info?.url ? info.url.split("#")[0] : "";

  return (
    <Modal title="Phone remote" onClose={onClose} width="max-w-sm">
      <div className="flex flex-col gap-6">
        {info === undefined ? (
          <div className="h-72" />
        ) : info.port === null ? (
          <Notice icon={<AlertTriangle size={16} />} tone="red" title="Phone remote unavailable">
            Ports 3000–3010 are all in use by other apps. Close them and restart StageClock.
          </Notice>
        ) : info.url === null ? (
          <Notice icon={<WifiOff size={16} />} tone="amber" title="Not on a network">
            Connect this computer to Wi-Fi, then reopen this window.
          </Notice>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <QRCode url={info.url} size={190} showUrl={false} />
            <p className="text-center text-xs text-zinc-500">
              Scan with a phone on the <span className="text-zinc-300">same Wi-Fi</span>. It pairs
              automatically — no PIN to type — and stays paired until you disconnect it.
            </p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-zinc-600">{baseUrl}</span>
              <button
                type="button"
                onClick={copyLink}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                title="Copy the full pairing link"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
        )}

        {info && info.port !== null && (
          <section className="flex flex-col gap-3">
            <SectionLabel>Access</SectionLabel>
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm text-zinc-200">
                <span
                  className={`h-2 w-2 rounded-full ${info.connected > 0 ? "bg-emerald-400" : "bg-zinc-600"}`}
                />
                {info.connected === 0
                  ? "No phones connected"
                  : `${info.connected} phone${info.connected === 1 ? "" : "s"} connected`}
              </span>
              <Button size="sm" variant="ghost" onClick={disconnectAll} className="text-red-400 hover:text-red-300">
                <Unplug size={13} /> Disconnect all
              </Button>
            </div>
            <p className="flex items-start gap-2 text-xs text-zinc-500">
              <ShieldCheck size={14} className="mt-px shrink-0 text-zinc-500" />
              Only phones that scanned this code can connect. Disconnect all if a phone is lost or the
              code was shared too widely — you'll get a fresh code.
            </p>
          </section>
        )}
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
