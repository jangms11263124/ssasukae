use serde::Serialize;
use serde_json::Value;
use std::{
    env, fs,
    fs::OpenOptions,
    io::{self, BufWriter, Write},
    path::{Path, PathBuf},
    sync::mpsc::{self, Sender},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const RETENTION: Duration = Duration::from_secs(14 * 24 * 60 * 60);
const MAX_LOG_FILES: usize = 20;

#[derive(Clone)]
pub struct Diagnostics {
    sender: Sender<DiagnosticEntry>,
    room_id: String,
    session_id: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticEntry {
    timestamp_ms: u128,
    room_id: String,
    session_id: u64,
    event: String,
    details: Value,
}

impl Diagnostics {
    pub fn start(room_id: String, session_id: u64) -> io::Result<Self> {
        Self::start_in_dir(log_directory(), room_id, session_id)
    }

    fn start_in_dir(directory: PathBuf, room_id: String, session_id: u64) -> io::Result<Self> {
        fs::create_dir_all(&directory)?;
        cleanup(&directory)?;
        let filename = format!("session-{session_id}-{}.jsonl", now_ms());
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(directory.join(filename))?;
        let (sender, receiver) = mpsc::channel::<DiagnosticEntry>();
        thread::Builder::new()
            .name("diagnostic-writer".into())
            .spawn(move || {
                let mut writer = BufWriter::new(file);
                while let Ok(entry) = receiver.recv() {
                    if serde_json::to_writer(&mut writer, &entry).is_ok() {
                        let _ = writer.write_all(b"\n");
                        let _ = writer.flush();
                    }
                }
            })?;
        let diagnostics = Self {
            sender,
            room_id,
            session_id,
        };
        diagnostics.event(
            "diagnostics_started",
            serde_json::json!({ "version": env!("CARGO_PKG_VERSION") }),
        );
        Ok(diagnostics)
    }

    pub fn event(&self, event: impl Into<String>, details: Value) {
        let _ = self.sender.send(DiagnosticEntry {
            timestamp_ms: now_ms(),
            room_id: self.room_id.clone(),
            session_id: self.session_id,
            event: event.into(),
            details,
        });
    }
}

fn log_directory() -> PathBuf {
    env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(env::temp_dir)
        .join("SSAFYStar")
        .join("diagnostics")
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn cleanup(directory: &Path) -> io::Result<()> {
    let now = SystemTime::now();
    let mut files: Vec<(PathBuf, SystemTime)> = fs::read_dir(directory)?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("jsonl") {
                return None;
            }
            let modified = entry.metadata().ok()?.modified().ok()?;
            if now.duration_since(modified).unwrap_or_default() > RETENTION {
                let _ = fs::remove_file(path);
                return None;
            }
            Some((path, modified))
        })
        .collect();
    files.sort_by_key(|(_, modified)| *modified);
    let excess = files.len().saturating_sub(MAX_LOG_FILES - 1);
    for (path, _) in files.into_iter().take(excess) {
        let _ = fs::remove_file(path);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_a_json_line_with_session_context() {
        let directory = env::temp_dir().join(format!("ssafystar-diag-test-{}", now_ms()));
        let diagnostics = Diagnostics::start_in_dir(directory.clone(), "42".into(), 55001).unwrap();
        diagnostics.event("test", serde_json::json!({ "ok": true }));
        drop(diagnostics);
        thread::sleep(Duration::from_millis(50));
        let path = fs::read_dir(&directory)
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        let contents = fs::read_to_string(path).unwrap();
        assert!(contents.contains(r#""roomId":"42""#));
        assert!(contents.contains(r#""sessionId":55001"#));
        assert!(contents.contains(r#""event":"test""#));
        let _ = fs::remove_dir_all(directory);
    }
}
