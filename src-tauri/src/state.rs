use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
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
        }
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
