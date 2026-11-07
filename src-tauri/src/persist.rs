//! Saving the session to disk so a crash, an accidental quit or a reboot
//! mid-service doesn't lose the running timer.

use std::path::{Path, PathBuf};

use crate::state::{now_unix_ms, AppState, PersistedSession};

/// Where the session file lives. `None` if the app data dir is unavailable,
/// in which case saving is silently skipped (the app still works).
#[derive(Clone)]
pub struct Persistence {
    path: Option<PathBuf>,
}

impl Persistence {
    pub fn new(dir: Option<PathBuf>) -> Self {
        let path = dir.and_then(|d| {
            std::fs::create_dir_all(&d).ok()?;
            Some(d.join("session.json"))
        });
        Self { path }
    }

    pub fn load(&self) -> Option<PersistedSession> {
        let text = std::fs::read_to_string(self.path.as_ref()?).ok()?;
        serde_json::from_str(&text).ok()
    }

    /// Serialize under the caller's lock, then write.
    pub fn save(&self, s: &AppState) {
        let Some(path) = &self.path else { return };
        match serde_json::to_vec(&s.snapshot(now_unix_ms())) {
            Ok(bytes) => {
                if let Err(e) = write_atomic(path, &bytes) {
                    eprintln!("Could not save session: {e}");
                }
            }
            Err(e) => eprintln!("Could not serialize session: {e}"),
        }
    }
}

/// Write to a temp file and rename over the target, so a crash mid-write
/// can never leave a half-written (unreadable) session file.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn save_then_load_round_trips() {
        let dir = std::env::temp_dir().join(format!("stageclock-test-{}", uuid::Uuid::new_v4()));
        let p = Persistence::new(Some(dir.clone()));
        let mut s = AppState::new();
        s.load_item("a".into(), 300, Some("Talk".into()), Some("down".into()));
        p.save(&s);
        let loaded = p.load().expect("session file");
        assert_eq!(loaded.label.as_deref(), Some("Talk"));
        assert_eq!(loaded.elapsed_ms, 300_000);
        assert!(!dir.join("session.json.tmp").exists());
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn corrupt_file_is_ignored() {
        let dir = std::env::temp_dir().join(format!("stageclock-test-{}", uuid::Uuid::new_v4()));
        let p = Persistence::new(Some(dir.clone()));
        std::fs::write(dir.join("session.json"), b"{not json").unwrap();
        assert!(p.load().is_none());
        std::fs::remove_dir_all(dir).ok();
    }
}
