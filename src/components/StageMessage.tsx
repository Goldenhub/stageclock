import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MessageSquareText, Send, X } from "lucide-react";
import { Button, Panel, SectionLabel, inputClass } from "./ui";

const PRESETS = ["Speaker ready", "5 minutes left", "Wrap it up", "Please slow down", "Mic check"];

/** Send a short message to the speaker's screen. */
export function StageMessage({ current }: { current: string | null }) {
  const [text, setText] = useState("");

  function show(message: string | null) {
    invoke("set_banner", { text: message, durationSeconds: null }).catch(console.error);
  }

  function sendTyped() {
    const t = text.trim();
    if (!t) return;
    show(t);
    setText("");
  }

  return (
    <Panel className="flex flex-col gap-3 p-4">
      <SectionLabel
        right={
          current && (
            <Button size="sm" variant="ghost" onClick={() => show(null)} className="-my-1 text-red-400 hover:text-red-300">
              <X size={14} /> Clear message
            </Button>
          )
        }
      >
        <span className="inline-flex items-center gap-1.5">
          <MessageSquareText size={13} /> Message to speaker
        </span>
      </SectionLabel>

      {current && (
        <div className="rounded-lg border border-white/10 bg-white px-3 py-2 text-sm font-semibold text-zinc-950">
          {current}
        </div>
      )}

      <div className="flex gap-2">
        <input
          className={inputClass}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendTyped()}
          placeholder="Type a message and press Enter…"
          maxLength={80}
        />
        <Button variant="primary" onClick={sendTyped} disabled={!text.trim()}>
          <Send size={15} /> Show
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const active = current === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => show(active ? null : p)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-white bg-white text-zinc-950"
                  : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
              }`}
            >
              {p}
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
