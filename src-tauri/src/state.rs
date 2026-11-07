use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ScheduleItem {
    pub id: String,
    pub label: String,
    pub duration_seconds: u64,
    #[serde(default = "default_direction")]
    pub direction: String,
}

fn default_direction() -> String {
    "down".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimerState {
    pub elapsed_ms: i64,
    pub duration_ms: u64,
    pub running: bool,
    pub direction: String,
    pub active_item_id: Option<String>,
    pub label: Option<String>,
    pub overtime: bool,
    pub allow_overtime: bool,
    pub next_item_label: Option<String>,
    pub banner_text: Option<String>,
    pub warning_seconds: u64,
    pub critical_seconds: u64,
}

impl Default for TimerState {
    fn default() -> Self {
        AppState::new().get_timer_state()
    }
}

pub struct AppState {
    pub elapsed_at_snapshot: i64,
    pub start_instant: Option<Instant>,
    pub duration_ms: u64,
    pub direction: String,
    pub running: bool,
    pub active_item_id: Option<String>,
    pub label: Option<String>,
    pub allow_overtime: bool,
    pub schedule_items: Vec<ScheduleItem>,
    pub schedule_name: String,
    pub banner_text: Option<String>,
    /// When set, the banner is cleared automatically once this instant passes.
    pub banner_expires_at: Option<Instant>,
    pub warning_seconds: u64,
    pub critical_seconds: u64,
    /// Whether the stage window is showing, and on which monitor — restored
    /// after a restart so the stage doesn't go blank.
    pub display_live: bool,
    pub display_monitor: Option<usize>,
    /// Set once after a restart restored a timer; shown to the operator.
    pub recovery_notice: Option<String>,
}

/// Wall-clock milliseconds since the Unix epoch.
pub fn now_unix_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// How long after the last save a running timer is still resumed as running.
/// Covers a crash, an accidental quit or a reboot mid-service; anything
/// longer (e.g. reopening the app days later) comes back paused instead.
pub const RESUME_WINDOW_MS: i64 = 30 * 60 * 1000;

/// What is written to disk so a restart can pick up where it left off.
/// Uses wall-clock time, because `Instant` means nothing after a restart.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PersistedSession {
    pub saved_at_ms: i64,
    pub elapsed_ms: i64,
    pub duration_ms: u64,
    pub direction: String,
    pub running: bool,
    pub active_item_id: Option<String>,
    pub label: Option<String>,
    pub allow_overtime: bool,
    pub schedule_items: Vec<ScheduleItem>,
    pub schedule_name: String,
    pub warning_seconds: u64,
    pub critical_seconds: u64,
    pub display_live: bool,
    pub display_monitor: Option<usize>,
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

impl AppState {
    pub fn new() -> Self {
        Self {
            elapsed_at_snapshot: 0,
            start_instant: None,
            duration_ms: 0,
            direction: "down".to_string(),
            running: false,
            active_item_id: None,
            label: None,
            allow_overtime: false,
            schedule_items: Vec::new(),
            schedule_name: String::new(),
            banner_text: None,
            banner_expires_at: None,
            warning_seconds: 120,
            critical_seconds: 30,
            display_live: false,
            display_monitor: None,
            recovery_notice: None,
        }
    }

    // ── Persistence ──────────────────────────────────────────────────────────

    /// Capture everything needed to restore this session at `now_ms`.
    pub fn snapshot(&self, now_ms: i64) -> PersistedSession {
        PersistedSession {
            saved_at_ms: now_ms,
            elapsed_ms: self.current_elapsed_ms(),
            duration_ms: self.duration_ms,
            direction: self.direction.clone(),
            running: self.running,
            active_item_id: self.active_item_id.clone(),
            label: self.label.clone(),
            allow_overtime: self.allow_overtime,
            schedule_items: self.schedule_items.clone(),
            schedule_name: self.schedule_name.clone(),
            warning_seconds: self.warning_seconds,
            critical_seconds: self.critical_seconds,
            display_live: self.display_live,
            display_monitor: self.display_monitor,
        }
    }

    /// Restore a saved session at `now_ms`. A timer that was running and was
    /// saved within `RESUME_WINDOW_MS` keeps running, with the time that
    /// passed while the app was down counted in. Older sessions come back
    /// paused where they were. Returns true if the stage should be shown.
    pub fn restore(&mut self, p: PersistedSession, now_ms: i64) -> bool {
        let gap_ms = (now_ms - p.saved_at_ms).max(0);
        let resume = p.running && gap_ms <= RESUME_WINDOW_MS;

        self.duration_ms = p.duration_ms;
        self.direction = p.direction;
        self.active_item_id = p.active_item_id;
        self.label = p.label;
        self.allow_overtime = p.allow_overtime;
        self.schedule_items = p.schedule_items;
        self.schedule_name = p.schedule_name;
        self.warning_seconds = p.warning_seconds;
        self.critical_seconds = p.critical_seconds;
        self.display_monitor = p.display_monitor;
        self.banner_text = None;
        self.banner_expires_at = None;

        if resume {
            self.elapsed_at_snapshot = if self.direction == "down" {
                p.elapsed_ms - gap_ms
            } else {
                p.elapsed_ms + gap_ms
            };
            self.start_instant = Some(Instant::now());
            self.running = true;
        } else {
            self.elapsed_at_snapshot = p.elapsed_ms;
            self.start_instant = None;
            self.running = false;
        }

        // Only bring the stage back for a live recovery, not days later.
        let show_stage = p.display_live && gap_ms <= RESUME_WINDOW_MS;
        self.display_live = show_stage;

        if let Some(label) = &self.label {
            let secs = gap_ms / 1000;
            self.recovery_notice = Some(if resume {
                format!("StageClock restarted. \"{label}\" kept running (it was closed for {secs} s).")
            } else if p.running {
                format!("\"{label}\" was running when StageClock closed. It has been restored, paused.")
            } else {
                format!("\"{label}\" has been restored from your last session.")
            });
        }
        show_stage
    }

    pub fn current_elapsed_ms(&self) -> i64 {
        if let Some(start) = self.start_instant {
            let running_ms = start.elapsed().as_millis() as i64;
            match self.direction.as_str() {
                "down" => self.elapsed_at_snapshot - running_ms,
                _ => self.elapsed_at_snapshot + running_ms,
            }
        } else {
            self.elapsed_at_snapshot
        }
    }

    /// The value the clock shows when an item is freshly loaded or reset.
    fn reset_value(&self) -> i64 {
        if self.direction == "down" {
            self.duration_ms as i64
        } else {
            0
        }
    }

    /// Replace the current elapsed value, keeping the clock running if it was.
    fn set_elapsed(&mut self, value: i64) {
        self.elapsed_at_snapshot = value;
        if self.running {
            self.start_instant = Some(Instant::now());
        }
    }

    // ── Commands (shared by the desktop UI and the phone remote) ─────────────

    pub fn start(&mut self) {
        if !self.running {
            self.elapsed_at_snapshot = self.current_elapsed_ms();
            self.start_instant = Some(Instant::now());
            self.running = true;
        }
    }

    pub fn pause(&mut self) {
        if self.running {
            self.elapsed_at_snapshot = self.current_elapsed_ms();
            self.start_instant = None;
            self.running = false;
        }
    }

    pub fn stop(&mut self) {
        self.elapsed_at_snapshot = self.reset_value();
        self.start_instant = None;
        self.running = false;
    }

    pub fn reset(&mut self) {
        let value = self.reset_value();
        self.set_elapsed(value);
    }

    /// Add or remove time. For a countdown that is already in overtime,
    /// adding time gives the speaker that much time from *now*, rather than
    /// paying off the overtime first.
    pub fn adjust(&mut self, delta_seconds: i64) {
        let current = self.current_elapsed_ms();
        let delta_ms = delta_seconds * 1000;
        let new_val = if self.direction == "down" && current < 0 && delta_ms > 0 {
            delta_ms
        } else {
            (current + delta_ms).max(0)
        };
        self.set_elapsed(new_val);
    }

    pub fn load_item(
        &mut self,
        item_id: String,
        duration_seconds: u64,
        label: Option<String>,
        direction: Option<String>,
    ) {
        self.duration_ms = duration_seconds * 1000;
        self.direction = direction.unwrap_or_else(default_direction);
        self.active_item_id = Some(item_id);
        self.label = label;
        self.running = false;
        self.start_instant = None;
        self.elapsed_at_snapshot = self.reset_value();
    }

    /// Apply an edit to the item currently on the clock. The label always
    /// updates. If the timer hasn't been started yet, the new duration and
    /// direction take effect too; once it is under way, the running clock is
    /// left alone so the speaker doesn't see a jump.
    pub fn update_active_item(
        &mut self,
        item_id: &str,
        label: String,
        duration_seconds: u64,
        direction: Option<String>,
    ) {
        if self.active_item_id.as_deref() != Some(item_id) {
            return;
        }
        self.label = Some(label);
        let untouched = !self.running && self.elapsed_at_snapshot == self.reset_value();
        if untouched {
            self.duration_ms = duration_seconds * 1000;
            if let Some(d) = direction {
                self.direction = d;
            }
            self.elapsed_at_snapshot = self.reset_value();
        }
    }

    pub fn set_banner(&mut self, text: Option<String>, duration_seconds: Option<u64>) {
        let text = text.filter(|t| !t.trim().is_empty());
        self.banner_expires_at = match (&text, duration_seconds) {
            (Some(_), Some(secs)) if secs > 0 => Some(Instant::now() + Duration::from_secs(secs)),
            _ => None,
        };
        self.banner_text = text;
    }

    /// Clear the banner if its timeout has passed. Returns true if it changed.
    pub fn expire_banner(&mut self) -> bool {
        match self.banner_expires_at {
            Some(at) if Instant::now() >= at => {
                self.banner_text = None;
                self.banner_expires_at = None;
                true
            }
            _ => false,
        }
    }

    pub fn next_item_label(&self) -> Option<String> {
        let active_id = self.active_item_id.as_ref()?;
        let idx = self.schedule_items.iter().position(|i| i.id == *active_id)?;
        self.schedule_items.get(idx + 1).map(|i| i.label.clone())
    }

    pub fn get_timer_state(&self) -> TimerState {
        let elapsed = self.current_elapsed_ms();
        let overtime = self.direction == "down" && elapsed < 0;
        TimerState {
            elapsed_ms: elapsed,
            duration_ms: self.duration_ms,
            running: self.running,
            direction: self.direction.clone(),
            active_item_id: self.active_item_id.clone(),
            label: self.label.clone(),
            overtime,
            allow_overtime: self.allow_overtime,
            next_item_label: self.next_item_label(),
            banner_text: self.banner_text.clone(),
            warning_seconds: self.warning_seconds,
            critical_seconds: self.critical_seconds,
        }
    }
}

pub type SharedState = Arc<Mutex<AppState>>;

/// Lock the shared state, recovering from a poisoned mutex instead of
/// panicking. A panic elsewhere must never freeze the stage display.
pub fn lock(state: &SharedState) -> MutexGuard<'_, AppState> {
    state.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn countdown(secs: u64) -> AppState {
        let mut s = AppState::new();
        s.load_item("a".into(), secs, Some("Talk".into()), Some("down".into()));
        s
    }

    #[test]
    fn load_sets_countdown_to_full_duration() {
        let s = countdown(300);
        assert_eq!(s.current_elapsed_ms(), 300_000);
        assert!(!s.running);
    }

    #[test]
    fn adding_time_in_overtime_starts_from_zero() {
        let mut s = countdown(60);
        s.elapsed_at_snapshot = -90_000; // 90 s over
        s.adjust(60);
        assert_eq!(s.current_elapsed_ms(), 60_000);
    }

    #[test]
    fn adding_time_before_zero_adds_to_remaining() {
        let mut s = countdown(60);
        s.elapsed_at_snapshot = 10_000;
        s.adjust(60);
        assert_eq!(s.current_elapsed_ms(), 70_000);
    }

    #[test]
    fn removing_time_clamps_at_zero() {
        let mut s = countdown(60);
        s.adjust(-300);
        assert_eq!(s.current_elapsed_ms(), 0);
    }

    #[test]
    fn count_up_adjust_changes_elapsed() {
        let mut s = AppState::new();
        s.load_item("a".into(), 0, None, Some("up".into()));
        s.adjust(60);
        assert_eq!(s.current_elapsed_ms(), 60_000);
        s.adjust(-120);
        assert_eq!(s.current_elapsed_ms(), 0);
    }

    #[test]
    fn stop_and_reset_return_to_start_value() {
        let mut s = countdown(120);
        s.elapsed_at_snapshot = 5_000;
        s.reset();
        assert_eq!(s.current_elapsed_ms(), 120_000);
        s.elapsed_at_snapshot = 5_000;
        s.stop();
        assert_eq!(s.current_elapsed_ms(), 120_000);
        assert!(!s.running);
    }

    #[test]
    fn pause_freezes_elapsed() {
        let mut s = countdown(120);
        s.start();
        assert!(s.running);
        s.pause();
        let frozen = s.current_elapsed_ms();
        std::thread::sleep(Duration::from_millis(20));
        assert_eq!(s.current_elapsed_ms(), frozen);
    }

    #[test]
    fn editing_untouched_active_item_applies_new_duration() {
        let mut s = countdown(120);
        s.update_active_item("a", "Sermon".into(), 600, Some("down".into()));
        assert_eq!(s.label.as_deref(), Some("Sermon"));
        assert_eq!(s.current_elapsed_ms(), 600_000);
    }

    #[test]
    fn editing_started_active_item_only_changes_label() {
        let mut s = countdown(120);
        s.elapsed_at_snapshot = 50_000;
        s.update_active_item("a", "Sermon".into(), 600, None);
        assert_eq!(s.label.as_deref(), Some("Sermon"));
        assert_eq!(s.current_elapsed_ms(), 50_000);
    }

    #[test]
    fn editing_other_item_is_ignored() {
        let mut s = countdown(120);
        s.update_active_item("b", "Other".into(), 600, None);
        assert_eq!(s.label.as_deref(), Some("Talk"));
    }

    #[test]
    fn running_countdown_resumes_with_downtime_counted() {
        let mut s = countdown(600);
        s.start();
        s.display_live = true;
        s.display_monitor = Some(1);
        let saved = s.snapshot(1_000_000);

        let mut r = AppState::new();
        let show = r.restore(saved, 1_000_000 + 8_000); // down for 8 s
        assert!(show);
        assert!(r.running);
        let e = r.current_elapsed_ms();
        assert!((591_900..=592_000).contains(&e), "elapsed {e}");
        assert_eq!(r.display_monitor, Some(1));
        assert!(r.recovery_notice.unwrap().contains("kept running"));
    }

    #[test]
    fn running_count_up_resumes_forward() {
        let mut s = AppState::new();
        s.load_item("u".into(), 0, Some("Fellowship".into()), Some("up".into()));
        s.elapsed_at_snapshot = 60_000;
        s.start();
        let saved = s.snapshot(0);
        let mut r = AppState::new();
        r.restore(saved, 5_000);
        assert!(r.running);
        assert!(r.current_elapsed_ms() >= 65_000);
    }

    #[test]
    fn stale_session_comes_back_paused_and_stage_hidden() {
        let mut s = countdown(600);
        s.start();
        s.display_live = true;
        let saved = s.snapshot(0);
        let mut r = AppState::new();
        let show = r.restore(saved, RESUME_WINDOW_MS + 1);
        assert!(!show);
        assert!(!r.running);
        assert_eq!(r.current_elapsed_ms(), 600_000);
        assert!(r.recovery_notice.unwrap().contains("paused"));
    }

    #[test]
    fn paused_session_restores_exact_value() {
        let mut s = countdown(600);
        s.elapsed_at_snapshot = 123_000;
        let saved = s.snapshot(0);
        let mut r = AppState::new();
        r.restore(saved, 10_000);
        assert!(!r.running);
        assert_eq!(r.current_elapsed_ms(), 123_000);
    }

    #[test]
    fn clock_moving_backwards_counts_as_no_gap() {
        let mut s = countdown(600);
        s.start();
        let saved = s.snapshot(50_000);
        let mut r = AppState::new();
        r.restore(saved, 10_000); // system clock went back
        assert!(r.running);
        assert!(r.current_elapsed_ms() <= 600_000);
        assert!(r.current_elapsed_ms() > 599_000);
    }

    #[test]
    fn snapshot_round_trips_through_json() {
        let s = countdown(300);
        let p = s.snapshot(42);
        let json = serde_json::to_string(&p).unwrap();
        assert_eq!(serde_json::from_str::<PersistedSession>(&json).unwrap(), p);
    }

    #[test]
    fn banner_expires() {
        let mut s = AppState::new();
        s.set_banner(Some("Wrap it up".into()), Some(30));
        assert!(!s.expire_banner());
        s.banner_expires_at = Some(Instant::now() - Duration::from_millis(1));
        assert!(s.expire_banner());
        assert!(s.banner_text.is_none());
    }

    #[test]
    fn banner_without_duration_stays() {
        let mut s = AppState::new();
        s.set_banner(Some("Hello".into()), None);
        assert!(!s.expire_banner());
        assert_eq!(s.banner_text.as_deref(), Some("Hello"));
        s.set_banner(Some("   ".into()), Some(30));
        assert!(s.banner_text.is_none());
    }
}
