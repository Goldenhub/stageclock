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
  banner_text: string | null;
}

export interface ScheduleItem {
  id: string;
  label: string;
  duration: number;         // seconds
  direction: "up" | "down";
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
  showNextItem: boolean;
  autoAdvance: boolean;
  pin: string;
  secondaryMonitorIndex: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  alertThresholds: {
    warningSeconds: 120,
    criticalSeconds: 30,
  },
  showNextItem: true,
  autoAdvance: false,
  pin: "1234",
  secondaryMonitorIndex: 1,
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
  banner_text: null,
};

export type ColorState = "normal" | "warning" | "critical" | "overtime" | "times_up";
