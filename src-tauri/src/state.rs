use std::sync::{Arc, Mutex};
use std::time::Instant;
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
}

impl Default for TimerState {
    fn default() -> Self {
        Self {
            elapsed_ms: 0,
            duration_ms: 0,
            running: false,
            direction: "down".to_string(),
            active_item_id: None,
            label: None,
            overtime: false,
            allow_overtime: false,
            next_item_label: None,
            banner_text: None,
        }
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
        }
    }
}

pub type SharedState = Arc<Mutex<AppState>>;
