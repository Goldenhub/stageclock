//! Pairing and access control for the phone remote.
//!
//! Phones pair by scanning a QR code that carries a random 128-bit token
//! (in the URL fragment, so it is never sent in an HTTP request line or
//! logged). There is no PIN to guess. On top of that, each network address
//! gets a handful of wrong attempts before being locked out for a while,
//! and the operator can revoke every paired phone at once.

use std::collections::HashMap;
use std::net::IpAddr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tokio::sync::watch;

use crate::persist::write_atomic;

/// Wrong attempts allowed per address within `FAILURE_WINDOW`.
pub const MAX_FAILURES: u32 = 5;
pub const FAILURE_WINDOW: Duration = Duration::from_secs(10 * 60);
pub const LOCKOUT: Duration = Duration::from_secs(5 * 60);

#[derive(Debug, PartialEq, Eq)]
pub enum AuthResult {
    Ok,
    Denied,
    LockedOut,
}

#[derive(Default)]
struct Attempts {
    failures: u32,
    window_start: Option<Instant>,
    locked_until: Option<Instant>,
}

pub struct RemoteAuth {
    token: Mutex<String>,
    attempts: Mutex<HashMap<IpAddr, Attempts>>,
    /// Bumped whenever access is revoked; open sessions watch it and close.
    epoch: watch::Sender<u64>,
    connected: AtomicUsize,
    config_path: Option<PathBuf>,
}

/// 32 hex characters from a v4 UUID: 122 random bits from the OS RNG —
/// far beyond guessing, even without the lockout.
pub fn new_token() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

/// Compare without leaking how many leading characters matched.
fn constant_time_eq(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

impl RemoteAuth {
    /// Load the pairing token from `config.json`, creating one on first run.
    pub fn load_or_create(config_dir: Option<PathBuf>) -> Self {
        let config_path = config_dir.and_then(|d| {
            std::fs::create_dir_all(&d).ok()?;
            Some(d.join("config.json"))
        });
        let existing = config_path
            .as_ref()
            .and_then(|p| std::fs::read_to_string(p).ok())
            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
            .and_then(|v| v.get("remote_token")?.as_str().map(String::from))
            .filter(|t| t.len() >= 32);

        let auth = Self::with_token(existing.clone().unwrap_or_else(new_token), config_path);
        if existing.is_none() {
            auth.save();
        }
        auth
    }

    pub fn with_token(token: String, config_path: Option<PathBuf>) -> Self {
        Self {
            token: Mutex::new(token),
            attempts: Mutex::new(HashMap::new()),
            epoch: watch::channel(0).0,
            connected: AtomicUsize::new(0),
            config_path,
        }
    }

    pub fn token(&self) -> String {
        self.token.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    fn save(&self) {
        let Some(path) = &self.config_path else { return };
        let json = serde_json::json!({ "remote_token": self.token() });
        if let Err(e) = write_atomic(path, json.to_string().as_bytes()) {
            eprintln!("Could not save remote token: {e}");
        }
    }

    /// Check a token from `ip` at time `now`, applying the lockout rules.
    pub fn check(&self, ip: IpAddr, candidate: &str, now: Instant) -> AuthResult {
        let mut attempts = self.attempts.lock().unwrap_or_else(|e| e.into_inner());
        let entry = attempts.entry(ip).or_default();

        if let Some(until) = entry.locked_until {
            if now < until {
                return AuthResult::LockedOut;
            }
            *entry = Attempts::default();
        }

        if constant_time_eq(candidate, &self.token()) {
            attempts.remove(&ip);
            return AuthResult::Ok;
        }

        match entry.window_start {
            Some(start) if now.duration_since(start) <= FAILURE_WINDOW => entry.failures += 1,
            _ => {
                entry.window_start = Some(now);
                entry.failures = 1;
            }
        }
        if entry.failures >= MAX_FAILURES {
            entry.locked_until = Some(now + LOCKOUT);
            return AuthResult::LockedOut;
        }
        AuthResult::Denied
    }

    /// Issue a new token and disconnect every paired phone.
    pub fn revoke_all(&self) -> String {
        let token = new_token();
        *self.token.lock().unwrap_or_else(|e| e.into_inner()) = token.clone();
        self.save();
        self.epoch.send_modify(|e| *e += 1);
        token
    }

    pub fn subscribe_revocations(&self) -> watch::Receiver<u64> {
        self.epoch.subscribe()
    }

    pub fn connected(&self) -> usize {
        self.connected.load(Ordering::Relaxed)
    }

    /// Count a paired phone for as long as the returned guard lives.
    pub fn track_connection(&self) -> ConnectionGuard<'_> {
        self.connected.fetch_add(1, Ordering::Relaxed);
        ConnectionGuard(&self.connected)
    }
}

pub struct ConnectionGuard<'a>(&'a AtomicUsize);

impl Drop for ConnectionGuard<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::Relaxed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ip(n: u8) -> IpAddr {
        IpAddr::from([192, 168, 1, n])
    }

    #[test]
    fn tokens_are_long_and_unique() {
        let a = new_token();
        let b = new_token();
        assert_eq!(a.len(), 32);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b);
    }

    #[test]
    fn correct_token_is_accepted() {
        let auth = RemoteAuth::with_token("a".repeat(32), None);
        assert_eq!(auth.check(ip(2), &"a".repeat(32), Instant::now()), AuthResult::Ok);
    }

    #[test]
    fn locks_out_after_max_failures_then_recovers() {
        let auth = RemoteAuth::with_token("a".repeat(32), None);
        let t0 = Instant::now();
        for _ in 0..MAX_FAILURES - 1 {
            assert_eq!(auth.check(ip(2), "nope", t0), AuthResult::Denied);
        }
        assert_eq!(auth.check(ip(2), "nope", t0), AuthResult::LockedOut);
        // Even the right token is refused while locked out…
        assert_eq!(auth.check(ip(2), &"a".repeat(32), t0), AuthResult::LockedOut);
        // …other devices are unaffected…
        assert_eq!(auth.check(ip(3), &"a".repeat(32), t0), AuthResult::Ok);
        // …and the lockout expires.
        assert_eq!(auth.check(ip(2), &"a".repeat(32), t0 + LOCKOUT), AuthResult::Ok);
    }

    #[test]
    fn failures_outside_the_window_are_forgotten() {
        let auth = RemoteAuth::with_token("a".repeat(32), None);
        let t0 = Instant::now();
        for _ in 0..MAX_FAILURES - 1 {
            auth.check(ip(2), "nope", t0);
        }
        let later = t0 + FAILURE_WINDOW + Duration::from_secs(1);
        assert_eq!(auth.check(ip(2), "nope", later), AuthResult::Denied);
    }

    #[test]
    fn revoking_changes_token_and_notifies_sessions() {
        let auth = RemoteAuth::with_token("a".repeat(32), None);
        let rx = auth.subscribe_revocations();
        let new = auth.revoke_all();
        assert_ne!(new, "a".repeat(32));
        assert!(rx.has_changed().unwrap());
        assert_eq!(auth.check(ip(2), &"a".repeat(32), Instant::now()), AuthResult::Denied);
        assert_eq!(auth.check(ip(2), &new, Instant::now()), AuthResult::Ok);
    }

    #[test]
    fn connection_count_tracks_guards() {
        let auth = RemoteAuth::with_token("a".repeat(32), None);
        {
            let _a = auth.track_connection();
            let _b = auth.track_connection();
            assert_eq!(auth.connected(), 2);
        }
        assert_eq!(auth.connected(), 0);
    }

    #[test]
    fn token_persists_across_loads() {
        let dir = std::env::temp_dir().join(format!("stageclock-auth-{}", uuid::Uuid::new_v4()));
        let first = RemoteAuth::load_or_create(Some(dir.clone())).token();
        let second = RemoteAuth::load_or_create(Some(dir.clone())).token();
        assert_eq!(first, second);
        std::fs::remove_dir_all(dir).ok();
    }
}
