import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { TimerState } from "../types";
import { DEFAULT_TIMER_STATE } from "../types";

export function useTimer() {
  const [state, setState] = useState<TimerState>(DEFAULT_TIMER_STATE);
  // False until the real state has arrived from Rust (the placeholder
  // default must not be mistaken for "timer is at zero").
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const receive = (s: TimerState) => {
      setState(s);
      setReady(true);
    };
    // Fetch initial state
    invoke<TimerState>("get_timer_state").then(receive).catch(console.error);

    // Listen for state updates from Rust
    const unlisten = listen<TimerState>("timer-state-updated", (event) => {
      receive(event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const start = useCallback(() => invoke("timer_command", { action: "start" }), []);
  const pause = useCallback(() => invoke("timer_command", { action: "pause" }), []);
  const stop = useCallback(() => invoke("timer_command", { action: "stop" }), []);
  const reset = useCallback(() => invoke("timer_command", { action: "reset" }), []);

  const adjust = useCallback(
    (deltaSeconds: number) => invoke("adjust_timer", { deltaSeconds }),
    []
  );

  const loadItem = useCallback(
    (itemId: string, durationSeconds: number, label: string, direction?: string) =>
      invoke("load_item", { itemId, durationSeconds, label, direction: direction ?? "down" }),
    []
  );

  const setAllowOvertime = useCallback(
    (allow: boolean) => invoke("set_allow_overtime", { allow }),
    []
  );

  const toggle = useCallback(
    () => (state.running ? pause() : start()),
    [state.running, pause, start]
  );

  return { state, ready, start, pause, stop, reset, adjust, loadItem, setAllowOvertime, toggle };
}
