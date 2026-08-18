export interface TimerState {
  elapsed_ms: number;       // negative = overtime for countdown
  duration_ms: number;      // 0 = count-up mode
  running: boolean;
  direction: "up" | "down";
  active_item_id: string | null;
  label: string | null;
  overtime: boolean;
  allow_overtime: boolean;  // if false and overtime, display "TIME'S UP"
  next_item_label: string | null;
}

export interface ScheduleItem {
  id: string;
  label: string;
  duration: number;         // seconds
  notes?: string;
}

export interface Schedule {
  id: string;
  name: string;
  items: ScheduleItem[];
}

export interface AppSettings {
  alertThresholds: {
    warningSeconds: number;  // default 120 — amber
    criticalSeconds: number; // default 30 — red + flash
  };
  displayFontScale: number;
  showNextItem: boolean;
  autoAdvance: boolean;
  pin: string;
  brandColor: string;
  logoText: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  alertThresholds: {
    warningSeconds: 120,
    criticalSeconds: 30,
  },
  displayFontScale: 1.0,
  showNextItem: true,
  autoAdvance: false,
  pin: "1234",
  brandColor: "#6366f1",
  logoText: "EVENT TIMER",
};

export const DEFAULT_TIMER_STATE: TimerState = {
  elapsed_ms: 0,
  duration_ms: 0,
  running: false,
  direction: "down",
  active_item_id: null,
  label: null,
  overtime: false,
  allow_overtime: false,
  next_item_label: null,
};

export type ColorState = "normal" | "warning" | "critical" | "overtime" | "times_up";
