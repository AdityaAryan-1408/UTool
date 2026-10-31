use std::mem::size_of;
use std::fs::OpenOptions;
use std::io::Write;
use std::os::windows::ffi::OsStringExt;
use std::os::windows::fs::MetadataExt;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::ptr::{null, null_mut};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use quick_xml::events::Event;
use quick_xml::Reader;
use windows_sys::Win32::Foundation::GlobalFree;
use windows_sys::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE, GMEM_ZEROINIT};
use windows_sys::Win32::System::DataExchange::{CloseClipboard, EmptyClipboard, GetClipboardData, OpenClipboard, SetClipboardData};
use windows_sys::Win32::UI::Shell::{DragQueryFileW, DROPFILES};
use windows_sys::Win32::UI::Controls::Dialogs::{GetSaveFileNameW, CommDlgExtendedError, OPENFILENAMEW, OFN_EXPLORER, OFN_NOCHANGEDIR, OFN_OVERWRITEPROMPT, OFN_PATHMUSTEXIST};

const SHELF_TTL_SECS: u64 = 3 * 24 * 60 * 60;
const SHELF_CLEANUP_TASK: &str = "UtilityX Shelf Expiry";
const TASK_MIGRATION_MARKER: &str = "shelf-expiry-task-migration-v2";
const LEGACY_BINARY_NAMES: &[&str] = &["winutilx-task1.exe", "winutiltask1.exe", "Ollumi.exe", "Ollumi_0.1.0.exe"];
static SHELF_ID_COUNTER: AtomicU64 = AtomicU64::new(1);
static CLEANUP_LOCK: Mutex<()> = Mutex::new(());
static CLEANUP_ERROR_LOGGED: AtomicBool = AtomicBool::new(false);

fn shelf_log_at(app_data: &Path, message: &str) {
    let path = app_data.join("shelf-cleanup.log");
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{} [Ollumi Shelf] {message}", current_unix_seconds());
    }
}

fn shelf_log(dir: &Path, message: &str) {
    if let Some(app_data) = dir.parent() { shelf_log_at(app_data, message); }
}

fn shelf_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data = app.path().app_data_dir().map_err(|error| format!("Could not locate Ollumi app data: {error}"))?;
    let dir = app_data.join("shelf");
    if let Err(error) = std::fs::create_dir_all(&dir) {
        let message = format!("Could not create the Shelf storage folder: {error}");
        shelf_log_at(&app_data, &message);
        return Err(message);
    }
    match validate_shelf_root(&app_data, &dir) {
        Ok(path) => Ok(path),
        Err(error) => {
            shelf_log_at(&app_data, &format!("Shelf path validation failed: {error}"));
            Err(error)
        }
    }
}

fn current_unix_seconds() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()
}

fn item_added_path(dir: &Path, id: &str) -> PathBuf { dir.join(format!("{id}.added")) }

fn write_added_time_if_missing(dir: &Path, id: &str) -> Result<u64, String> {
    let path = item_added_path(dir, id);
    if !path.exists() {
        std::fs::write(&path, current_unix_seconds().to_string()).map_err(|error| error.to_string())?;
    }
    std::fs::read_to_string(path).ok().and_then(|value| value.trim().parse().ok()).ok_or_else(|| "Could not read Shelf item's expiry time.".into())
}

fn validate_shelf_root(app_data: &Path, requested: &Path) -> Result<PathBuf, String> {
    let canonical_parent = app_data.canonicalize().map_err(|error| format!("Could not resolve Ollumi app data: {error}"))?;
    let expected = canonical_parent.join("shelf");
    let canonical_requested = requested.canonicalize().map_err(|error| format!("Could not resolve the Shelf directory: {error}"))?;
    if !canonical_requested.is_dir() || !paths_equal_windows(&canonical_requested, &expected) {
        return Err("Shelf cleanup refused a path outside Ollumi's canonical Shelf directory.".into());
    }
    Ok(canonical_requested)
}

fn paths_equal_windows(left: &Path, right: &Path) -> bool {
    left.to_string_lossy().eq_ignore_ascii_case(&right.to_string_lossy())
}

fn is_reparse_point(metadata: &std::fs::Metadata) -> bool {
    metadata.file_attributes() & windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT != 0
}

fn cleanup_expired_in(dir: &Path) -> Result<usize, String> {
    let now = current_unix_seconds();
    let mut removed = 0;
    for entry in std::fs::read_dir(dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let metadata = match std::fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => return Err(error.to_string()),
        };
        if is_reparse_point(&metadata) || !metadata.is_file() {
            if is_reparse_point(&metadata) { shelf_log(dir, "Skipped a reparse point during expiry cleanup."); }
            continue;
        }
        let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else { continue; };
        let Some((id, _)) = file_name.split_once("--") else { continue; };
        if validate_id(id).is_err() { continue; }
        let added_path = item_added_path(dir, id);
        let added_at = safe_sidecar_text(&added_path)
            .ok()
            .and_then(|value| value.parse::<u64>().ok())
            .or_else(|| metadata.modified().ok()?.duration_since(UNIX_EPOCH).ok().map(|time| time.as_secs()))
            .unwrap_or(now);
        if now.saturating_sub(added_at) >= SHELF_TTL_SECS {
            std::fs::remove_file(&path).map_err(|error| error.to_string())?;
            for suffix in ["name", "added"] {
                let sidecar = dir.join(format!("{id}.{suffix}"));
                match std::fs::symlink_metadata(&sidecar) {
                    Ok(metadata) if !is_reparse_point(&metadata) && metadata.is_file() => {
                        std::fs::remove_file(&sidecar).map_err(|error| error.to_string())?;
                    }
                    Ok(metadata) if is_reparse_point(&metadata) => {
                        shelf_log(dir, "Skipped reparse-point Shelf metadata during expiry cleanup.");
                    }
                    Ok(_) => {}
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                    Err(error) => return Err(error.to_string()),
                }
            }
            removed += 1;
        }
    }
    Ok(removed)
}

fn safe_sidecar_text(path: &Path) -> Result<String, std::io::Error> {
    let metadata = std::fs::symlink_metadata(path)?;
    if is_reparse_point(&metadata) || !metadata.is_file() {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "unsafe Shelf sidecar"));
    }
    std::fs::read_to_string(path).map(|text| text.trim().to_owned())
}

fn migration_was_attempted(app_data: &Path) -> bool {
    let marker = app_data.join(TASK_MIGRATION_MARKER);
    match std::fs::symlink_metadata(&marker) {
        Ok(metadata) if !is_reparse_point(&metadata) && metadata.is_file() => true,
        Ok(_) => {
            shelf_log_at(app_data, "Legacy-task migration marker is not a regular file; migration was skipped.");
            true
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(error) => {
            shelf_log_at(app_data, &format!("Legacy-task migration status could not be checked: {error}"));
            true
        }
    }
}

fn mark_migration_attempted(app_data: &Path) {
    let marker = app_data.join(TASK_MIGRATION_MARKER);
    match OpenOptions::new().write(true).create_new(true).open(marker) {
        Ok(mut file) => {
            if let Err(error) = file.write_all(b"attempted\n") {
                shelf_log_at(app_data, &format!("Could not record the legacy-task migration result: {error}"));
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(error) => shelf_log_at(app_data, &format!("Could not record the legacy-task migration result: {error}")),
    }
}

fn parse_task_action(xml: &[u8]) -> Result<(String, String), String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut current_field: Option<bool> = None;
    let mut command = String::new();
    let mut arguments = String::new();
    loop {
        match reader.read_event() {
            Ok(Event::Start(element)) => {
                current_field = match element.local_name().as_ref() {
                    "Command" => Some(true),
                    "Arguments" => Some(false),
                    _ => current_field,
                };
            }
            Ok(Event::Text(text)) => {
                if let Some(field) = current_field {
                    let decoded = quick_xml::escape::unescape(text.as_ref()).map_err(|error| format!("Invalid task XML text: {error}"))?;
                    if field { command.push_str(&decoded); } else { arguments.push_str(&decoded); }
                }
            }
            Ok(Event::CData(text)) => {
                if let Some(field) = current_field {
                    if field { command.push_str(text.as_ref()); } else { arguments.push_str(text.as_ref()); }
                }
            }
            Ok(Event::GeneralRef(reference)) => {
                if let Some(field) = current_field {
                    let entity = format!("&{};", reference.as_ref());
                    let decoded = quick_xml::escape::unescape(&entity).map_err(|error| format!("Invalid task XML reference: {error}"))?;
                    if field { command.push_str(&decoded); } else { arguments.push_str(&decoded); }
                }
            }
            Ok(Event::End(element)) => {
                if matches!(element.local_name().as_ref(), "Command" | "Arguments") {
                    current_field = None;
                }
            }
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(error) => return Err(format!("Could not parse Task Scheduler XML: {error}")),
        }
    }
    if command.trim().is_empty() || arguments.trim().is_empty() {
        return Err("Task Scheduler XML did not contain a command and arguments.".into());
    }
    Ok((command.trim().to_owned(), arguments.trim().to_owned()))
}

fn task_xml_as_utf8(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let utf16le = bytes.starts_with(&[0xff, 0xfe]) || (bytes.len() > 1 && bytes[0] == b'<' && bytes[1] == 0);
    let utf16be = bytes.starts_with(&[0xfe, 0xff]) || (bytes.len() > 1 && bytes[0] == 0 && bytes[1] == b'<');
    if utf16le || utf16be {
        let data = if bytes.starts_with(&[0xff, 0xfe]) || bytes.starts_with(&[0xfe, 0xff]) { &bytes[2..] } else { bytes };
        if data.len() % 2 != 0 { return Err("Task Scheduler returned incomplete UTF-16 XML.".into()); }
        let words = data.chunks_exact(2).map(|pair| if utf16le { u16::from_le_bytes([pair[0], pair[1]]) } else { u16::from_be_bytes([pair[0], pair[1]]) });
        let decoded = char::decode_utf16(words).collect::<Result<String, _>>().map_err(|_| "Task Scheduler returned invalid UTF-16 XML.".to_string())?;
        return Ok(decoded.into_bytes());
    }
    let bytes = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]).unwrap_or(bytes);
    std::str::from_utf8(bytes).map_err(|_| "Task Scheduler returned XML with an unsupported encoding.".to_string())?;
    Ok(bytes.to_vec())
}

fn legacy_cleanup_path(arguments: &str) -> Option<PathBuf> {
    let rest = arguments.trim().strip_prefix("--utilityx-shelf-cleanup")?;
    if !rest.chars().next().is_some_and(char::is_whitespace) { return None; }
    let rest = rest.trim_start();
    if let Some(quoted) = rest.strip_prefix('"') {
        let (path, trailing) = quoted.split_once('"')?;
        if !trailing.trim().is_empty() { return None; }
        Some(PathBuf::from(path))
    } else if !rest.is_empty() && !rest.chars().any(char::is_whitespace) {
        Some(PathBuf::from(rest))
    } else {
        None
    }
}

fn is_legacy_expiry_action(xml: &[u8], install_dir: &Path, shelf_root: &Path) -> bool {
    let Ok((command, arguments)) = parse_task_action(xml) else { return false; };
    let command = PathBuf::from(command.trim().trim_matches('"'));
    let Some(file_name) = command.file_name().and_then(|value| value.to_str()) else { return false; };
    if !LEGACY_BINARY_NAMES.iter().any(|legacy| file_name.eq_ignore_ascii_case(legacy)) { return false; }
    let Some(command_parent) = command.parent().and_then(|path| path.canonicalize().ok()) else { return false; };
    let Ok(expected_install_dir) = install_dir.canonicalize() else { return false; };
    if !paths_equal_windows(&command_parent, &expected_install_dir) { return false; }
    let Some(action_shelf) = legacy_cleanup_path(&arguments) else { return false; };
    let Some(action_shelf) = action_shelf.canonicalize().ok() else { return false; };
    paths_equal_windows(&action_shelf, shelf_root)
}

fn csv_first_field(line: &str) -> Option<String> {
    let line = line.trim_start_matches('\u{feff}').trim();
    if let Some(mut rest) = line.strip_prefix('"') {
        let mut field = String::new();
        loop {
            let next_quote = rest.find('"')?;
            field.push_str(&rest[..next_quote]);
            rest = &rest[next_quote + 1..];
            if let Some(escaped) = rest.strip_prefix('"') {
                field.push('"');
                rest = escaped;
            } else {
                return Some(field);
            }
        }
    } else {
        Some(line.split(',').next()?.trim().to_owned())
    }
}

fn task_list_contains_legacy_name(output: &[u8]) -> bool {
    String::from_utf8_lossy(output).lines().filter_map(csv_first_field).any(|name| {
        name.trim_start_matches('\\').eq_ignore_ascii_case(SHELF_CLEANUP_TASK)
    })
}

fn should_mark_task_migration(task_exists: bool, legacy_task_removed: bool) -> bool {
    !task_exists || legacy_task_removed
}

fn query_legacy_task_exists() -> Result<bool, String> {
    let output = Command::new("schtasks.exe")
        .args(["/Query", "/FO", "CSV", "/NH"])
        .creation_flags(0x08000000)
        .output()
        .map_err(|error| format!("Could not list scheduled tasks: {error}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        return Err(if detail.is_empty() { format!("Task Scheduler returned {} while listing tasks.", output.status) } else { detail });
    }
    Ok(task_list_contains_legacy_name(&output.stdout))
}

fn should_remove_legacy_task(xml: Option<&[u8]>, install_dir: &Path, shelf_root: &Path) -> bool {
    xml.is_some_and(|bytes| {
        task_xml_as_utf8(bytes).ok().is_some_and(|decoded| is_legacy_expiry_action(&decoded, install_dir, shelf_root))
    })
}

pub fn migrate_legacy_expiry_task(app: &tauri::AppHandle) {
    let shelf_root = match shelf_dir(app) {
        Ok(path) => path,
        Err(error) => {
            if let Ok(app_data) = app.path().app_data_dir() { shelf_log_at(&app_data, &format!("Legacy task migration skipped because Shelf ownership could not be verified: {error}")); }
            return;
        }
    };
    let Some(app_data) = shelf_root.parent() else { return; };
    if migration_was_attempted(app_data) { return; }
    let install_dir = match std::env::current_exe().ok().and_then(|path| path.parent().map(Path::to_path_buf)) {
        Some(path) => path,
        None => {
            shelf_log(&shelf_root, "Legacy task migration skipped because the install directory could not be resolved.");
            return;
        }
    };
    let task_exists = match query_legacy_task_exists() {
        Ok(exists) => exists,
        Err(error) => {
            shelf_log(&shelf_root, &format!("Could not determine whether the legacy task exists; migration will retry: {error}"));
            return;
        }
    };
    if !task_exists {
        if should_mark_task_migration(false, false) {
            shelf_log(&shelf_root, "No legacy Shelf expiry task exists; migration is complete.");
            mark_migration_attempted(app_data);
        }
        return;
    }
    let query = match Command::new("schtasks.exe")
        .args(["/Query", "/TN", SHELF_CLEANUP_TASK, "/XML"])
        .creation_flags(0x08000000)
        .output()
    {
        Ok(output) if output.status.success() => output,
        Ok(output) => {
            let detail = String::from_utf8_lossy(if output.stderr.is_empty() { &output.stdout } else { &output.stderr }).trim().to_owned();
            if detail.is_empty() {
                shelf_log(&shelf_root, &format!("Could not verify the legacy task; leaving it untouched (exit {}).", output.status));
            } else {
                shelf_log(&shelf_root, &format!("Could not verify the legacy task; leaving it untouched: {detail}"));
            }
            if matches!(query_legacy_task_exists(), Ok(false)) && should_mark_task_migration(false, false) {
                shelf_log(&shelf_root, "The legacy task disappeared during migration; migration is complete.");
                mark_migration_attempted(app_data);
            }
            return;
        }
        Err(error) => {
            shelf_log(&shelf_root, &format!("Could not query the legacy task; leaving it untouched: {error}"));
            if matches!(query_legacy_task_exists(), Ok(false)) && should_mark_task_migration(false, false) {
                shelf_log(&shelf_root, "The legacy task disappeared during migration; migration is complete.");
                mark_migration_attempted(app_data);
            }
            return;
        }
    };
    if !should_remove_legacy_task(Some(&query.stdout), &install_dir, &shelf_root) {
        shelf_log(&shelf_root, &format!("Task '{SHELF_CLEANUP_TASK}' is absent or does not match Ollumi's legacy action; leaving it untouched."));
        if matches!(query_legacy_task_exists(), Ok(false)) && should_mark_task_migration(false, false) {
            shelf_log(&shelf_root, "The task no longer exists; migration is complete.");
            mark_migration_attempted(app_data);
        }
        return;
    }
    let deletion = Command::new("schtasks.exe")
        .args(["/Delete", "/F", "/TN", SHELF_CLEANUP_TASK])
        .creation_flags(0x08000000)
        .output();
    match deletion {
        Ok(output) if output.status.success() => {
            match query_legacy_task_exists() {
                Ok(false) if should_mark_task_migration(false, true) => {
                    shelf_log(&shelf_root, "Removed the verified legacy expiry task; migration is complete.");
                    mark_migration_attempted(app_data);
                }
                Ok(true) => shelf_log(&shelf_root, "Task Scheduler still lists the legacy task after deletion; migration will retry."),
                Err(error) => shelf_log(&shelf_root, &format!("Could not confirm task removal; migration will retry: {error}")),
                Ok(false) => {}
            }
        }
        Ok(output) => shelf_log(&shelf_root, &format!("Could not remove the verified legacy expiry task; migration will retry: {}", String::from_utf8_lossy(&output.stderr).trim())),
        Err(error) => shelf_log(&shelf_root, &format!("Could not remove the verified legacy expiry task; migration will retry: {error}")),
    }
}

fn cleanup_shelf_dir(dir: &Path, report_progress: bool) -> Result<usize, String> {
    let _guard = CLEANUP_LOCK.lock().map_err(|_| {
        shelf_log(dir, "Cleanup could not start because its synchronization lock was poisoned.");
        "Shelf cleanup lock was poisoned.".to_string()
    })?;
    if report_progress { shelf_log(dir, "Expiry cleanup started."); }
    match cleanup_expired_in(dir) {
        Ok(removed) => {
            CLEANUP_ERROR_LOGGED.store(false, Ordering::Release);
            if report_progress {
                shelf_log(dir, &format!("Expiry cleanup completed; removed {removed} expired item(s)."));
            } else if removed > 0 {
                shelf_log(dir, &format!("Removed {removed} expired item(s)."));
            }
            Ok(removed)
        }
        Err(error) => {
            if !CLEANUP_ERROR_LOGGED.swap(true, Ordering::AcqRel) {
                shelf_log(dir, &format!("Expiry cleanup failed: {error}"));
            }
            Err(error)
        }
    }
}

pub fn cleanup_expired_shelf(app: &tauri::AppHandle, report_progress: bool) -> Result<usize, String> {
    let dir = shelf_dir(app)?;
    cleanup_shelf_dir(&dir, report_progress)
}

fn new_shelf_id() -> String {
    let millis = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
    let sequence = SHELF_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{millis}-{}-{sequence}", std::process::id())
}

fn validate_id(id: &str) -> Result<(), String> {
    if id.len() < 8 || id.len() > 80 || !id.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-') { return Err("Invalid shelf item ID.".into()); }
    Ok(())
}
fn safe_name(name: &str) -> String {
    let cleaned: String = name.chars().map(|ch| if ch.is_control() || ['<', '>', ':', '"', '/', '\\', '|', '?', '*'].contains(&ch) { '_' } else { ch }).collect();
    let trimmed = cleaned.trim().trim_matches('.');
    if trimmed.is_empty() { "Shelf_Item".into() } else { trimmed.chars().take(180).collect() }
}
fn file_path(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    validate_id(id)?;
    let dir = shelf_dir(app)?;
    let _ = cleanup_shelf_dir(&dir, false);
    let prefix = format!("{id}--");
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.file_name().and_then(|name| name.to_str()).is_some_and(|name| name.starts_with(&prefix)) {
                return Ok(path);
            }
        }
    }
    Ok(dir.join(format!("{id}--Shelf_Item")))
}

#[derive(serde::Serialize)]
pub struct ShelfFileInfo { id: String, name: String, path: String, bytes: u64 }

pub fn import_external_paths(app: &tauri::AppHandle, paths: &[PathBuf]) -> Result<usize, String> {
    Ok(import_external_paths_with_ids(app, paths)?.len())
}

pub fn import_external_paths_with_ids(app: &tauri::AppHandle, paths: &[PathBuf]) -> Result<Vec<String>, String> {
    let dir = shelf_dir(app)?;
    let _ = cleanup_shelf_dir(&dir, false);
    let mut imported_ids = Vec::new();
    for source in paths {
        if !source.is_file() { continue; }
        let original_name = source.file_name().and_then(|name| name.to_str()).unwrap_or("Dropped_File");
        let name = safe_name(original_name);
        let id = new_shelf_id();
        let target = dir.join(format!("{id}--{name}"));
        std::fs::copy(source, &target).map_err(|error| format!("Could not add {} to Shelf: {error}", name))?;
        std::fs::write(dir.join(format!("{id}.name")), &name).map_err(|error| format!("Could not save Shelf item name: {error}"))?;
        write_added_time_if_missing(&dir, &id)?;
        imported_ids.push(id);
    }
    Ok(imported_ids)
}

#[tauri::command]
pub fn shelf_import_clipboard_files(app: tauri::AppHandle) -> Result<usize, String> {
    let paths = unsafe {
        if OpenClipboard(null_mut()) == 0 { return Err("Windows clipboard is temporarily unavailable.".into()); }
        let drop_handle = GetClipboardData(15);
        if drop_handle.is_null() {
            CloseClipboard();
            return Ok(0);
        }
        let count = DragQueryFileW(drop_handle, u32::MAX, null_mut(), 0);
        let mut paths = Vec::with_capacity(count as usize);
        for index in 0..count {
            let length = DragQueryFileW(drop_handle, index, null_mut(), 0);
            if length == 0 { continue; }
            let mut wide = vec![0u16; length as usize + 1];
            let written = DragQueryFileW(drop_handle, index, wide.as_mut_ptr(), wide.len() as u32);
            if written > 0 { paths.push(PathBuf::from(std::ffi::OsString::from_wide(&wide[..written as usize]))); }
        }
        CloseClipboard();
        paths
    };
    import_external_paths(&app, &paths)
}

#[tauri::command]
pub fn shelf_list_files(app: tauri::AppHandle) -> Result<Vec<ShelfFileInfo>, String> {
    let dir = shelf_dir(&app)?;
    let _ = cleanup_shelf_dir(&dir, false);
    let mut files = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else { continue; };
        let Some((id, _)) = file_name.split_once("--") else { continue; };
        let id = id.to_owned();
        if validate_id(&id).is_err() { continue; }
        let metadata = entry.metadata().map_err(|error| error.to_string())?;
        let name_path = dir.join(format!("{id}.name"));
        let name = std::fs::read_to_string(name_path).unwrap_or_else(|_| format!("Shelf item {id}"));
        files.push(ShelfFileInfo { id, name, path: path.to_string_lossy().into_owned(), bytes: metadata.len() });
    }
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(files)
}

#[tauri::command]
pub fn shelf_read_file(app: tauri::AppHandle, id: String) -> Result<Vec<u8>, String> { std::fs::read(file_path(&app, &id)?).map_err(|error| format!("Could not read shelf item: {error}")) }

#[tauri::command]
pub fn shelf_store_file(app: tauri::AppHandle, id: String, name: String, bytes: Vec<u8>) -> Result<ShelfFileInfo, String> {
    let name = safe_name(&name);
    validate_id(&id)?;
    let dir = shelf_dir(&app)?;
    let _ = cleanup_shelf_dir(&dir, false);
    let path = dir.join(format!("{id}--{name}"));
    for entry in std::fs::read_dir(&dir).map_err(|error| error.to_string())? {
        let existing = entry.map_err(|error| error.to_string())?.path();
        if existing.file_name().and_then(|part| part.to_str()).is_some_and(|part| part.starts_with(&format!("{id}--"))) && existing != path {
            std::fs::remove_file(existing).map_err(|error| error.to_string())?;
        }
    }
    std::fs::write(&path, bytes).map_err(|error| format!("Could not save shelf item: {error}"))?;
    std::fs::write(dir.join(format!("{id}.name")), &name).map_err(|error| format!("Could not save shelf item name: {error}"))?;
    write_added_time_if_missing(&dir, &id)?;
    let length = std::fs::metadata(&path).map_err(|error| error.to_string())?.len();
    Ok(ShelfFileInfo { id, name, path: path.to_string_lossy().into_owned(), bytes: length })
}

#[tauri::command]
pub fn shelf_delete_file(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let path = file_path(&app, &id)?;
    if path.exists() { std::fs::remove_file(&path).map_err(|error| error.to_string())?; }
    let name_path = shelf_dir(&app)?.join(format!("{id}.name"));
    if name_path.exists() { std::fs::remove_file(name_path).map_err(|error| error.to_string())?; }
    let added_path = shelf_dir(&app)?.join(format!("{id}.added"));
    if added_path.exists() { std::fs::remove_file(added_path).map_err(|error| error.to_string())?; }
    Ok(())
}

#[tauri::command]
pub fn shelf_clear_files(app: tauri::AppHandle) -> Result<(), String> {
    let dir = shelf_dir(&app)?;
    for entry in std::fs::read_dir(dir).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.file_name().and_then(|name| name.to_str()).is_some_and(|name| name.contains("--") || name.ends_with(".name") || name.ends_with(".added")) {
            std::fs::remove_file(path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn shelf_open_file(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let path = file_path(&app, &id)?;
    if !path.exists() { return Err("Shelf item was not found on disk.".into()); }
    let path_wide: Vec<u16> = path.to_string_lossy().encode_utf16().chain([0]).collect();
    let verb: Vec<u16> = "open".encode_utf16().chain([0]).collect();
    unsafe {
        let result = windows_sys::Win32::UI::Shell::ShellExecuteW(null_mut(), verb.as_ptr(), path_wide.as_ptr(), null(), null(), windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL);
        if result as isize <= 32 { Err(format!("Windows could not open this file (shell error {}).", result as isize)) } else { Ok(()) }
    }
}

#[tauri::command]
pub fn shelf_reveal_file(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let path = file_path(&app, &id)?;
    if !path.exists() { return Err("Shelf item was not found on disk.".into()); }
    let args = format!("/select,\"{}\"", path.to_string_lossy());
    let wide_args: Vec<u16> = args.encode_utf16().chain([0]).collect();
    let verb: Vec<u16> = "open".encode_utf16().chain([0]).collect();
    let explorer: Vec<u16> = "explorer.exe".encode_utf16().chain([0]).collect();
    unsafe {
        let result = windows_sys::Win32::UI::Shell::ShellExecuteW(null_mut(), verb.as_ptr(), explorer.as_ptr(), wide_args.as_ptr(), null(), windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL);
        if result as isize <= 32 { Err(format!("Windows could not show the item in Explorer (shell error {}).", result as isize)) } else { Ok(()) }
    }
}

#[tauri::command]
pub fn shelf_get_location(app: tauri::AppHandle) -> Result<String, String> {
    Ok(shelf_dir(&app)?.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn shelf_open_location(app: tauri::AppHandle) -> Result<(), String> {
    let path = shelf_dir(&app)?;
    let path_wide: Vec<u16> = path.to_string_lossy().encode_utf16().chain([0]).collect();
    let verb: Vec<u16> = "open".encode_utf16().chain([0]).collect();
    let explorer: Vec<u16> = "explorer.exe".encode_utf16().chain([0]).collect();
    unsafe {
        let result = windows_sys::Win32::UI::Shell::ShellExecuteW(null_mut(), verb.as_ptr(), explorer.as_ptr(), path_wide.as_ptr(), null(), windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL);
        if result as isize <= 32 { Err(format!("Windows could not open the Shelf folder (shell error {}).", result as isize)) } else { Ok(()) }
    }
}

#[tauri::command]
pub fn shelf_save_file_as(app: tauri::AppHandle, id: String) -> Result<Option<String>, String> {
    let source = file_path(&app, &id)?;
    if !source.exists() { return Err("Shelf item was not found on disk.".into()); }
    let name = source.file_name().and_then(|part| part.to_str()).and_then(|part| part.split_once("--").map(|(_, name)| name)).unwrap_or("Shelf_Item");
    let mut file_name: Vec<u16> = name.encode_utf16().chain([0]).collect();
    file_name.resize(32768, 0);
    let filter: Vec<u16> = "All files\0*.*\0\0".encode_utf16().collect();
    let title: Vec<u16> = "Save Shelf item".encode_utf16().chain([0]).collect();
    let initial_dir = app.path().download_dir().ok();
    let initial_dir_wide = initial_dir.as_ref().map(|path| path.to_string_lossy().encode_utf16().chain([0]).collect::<Vec<_>>());
    let mut dialog: OPENFILENAMEW = unsafe { std::mem::zeroed() };
    dialog.lStructSize = size_of::<OPENFILENAMEW>() as u32;
    dialog.lpstrFilter = filter.as_ptr();
    dialog.lpstrFile = file_name.as_mut_ptr();
    dialog.nMaxFile = file_name.len() as u32;
    dialog.lpstrTitle = title.as_ptr();
    dialog.lpstrInitialDir = initial_dir_wide.as_ref().map_or(null(), |path| path.as_ptr());
    dialog.Flags = OFN_EXPLORER | OFN_NOCHANGEDIR | OFN_OVERWRITEPROMPT | OFN_PATHMUSTEXIST;
    let chosen = unsafe { GetSaveFileNameW(&mut dialog) };
    if chosen == 0 {
        let error = unsafe { CommDlgExtendedError() };
        if error == 0 { return Ok(None); }
        return Err(format!("Windows could not show the Save As dialog (error {error:#x})."));
    }
    let length = file_name.iter().position(|unit| *unit == 0).unwrap_or(file_name.len());
    let destination = PathBuf::from(std::ffi::OsString::from_wide(&file_name[..length]));
    std::fs::copy(&source, &destination).map_err(|error| format!("Could not save the Shelf item to the selected location: {error}"))?;
    Ok(Some(destination.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn shelf_copy_file(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let path = file_path(&app, &id)?
        .canonicalize()
        .map_err(|error| format!("Could not resolve Shelf item: {error}"))?;
    let wide_path: Vec<u16> = path.to_string_lossy().encode_utf16().chain([0, 0]).collect();
    let bytes = size_of::<DROPFILES>() + wide_path.len() * size_of::<u16>();
    unsafe {
        let memory = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, bytes);
        if memory.is_null() {
            return Err("Could not allocate Windows clipboard data.".into());
        }
        let pointer = GlobalLock(memory) as *mut u8;
        if pointer.is_null() {
            GlobalFree(memory);
            return Err("Could not prepare Windows clipboard data.".into());
        }
        let drop_files = pointer as *mut DROPFILES;
        (*drop_files).pFiles = size_of::<DROPFILES>() as u32;
        (*drop_files).fWide = 1;
        std::ptr::copy_nonoverlapping(
            wide_path.as_ptr(),
            pointer.add(size_of::<DROPFILES>()) as *mut u16,
            wide_path.len(),
        );
        GlobalUnlock(memory);
        if OpenClipboard(null_mut()) == 0 {
            GlobalFree(memory);
            return Err("Windows clipboard is temporarily unavailable.".into());
        }
        EmptyClipboard();
        let transferred = SetClipboardData(15, memory);
        CloseClipboard();
        if transferred.is_null() {
            GlobalFree(memory);
            return Err("Windows could not copy the file to the clipboard.".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicU64;

    static TEST_DIR_ID: AtomicU64 = AtomicU64::new(1);

    struct TestTree(PathBuf);

    impl TestTree {
        fn new() -> Self {
            let id = TEST_DIR_ID.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!("ollumi-shelf-test-{}-{id}", std::process::id()));
            let _ = std::fs::remove_dir_all(&root);
            std::fs::create_dir_all(root.join("appdata").join("shelf")).unwrap();
            std::fs::create_dir_all(root.join("install & data")).unwrap();
            Self(root)
        }

        fn app_data(&self) -> PathBuf { self.0.join("appdata") }
        fn shelf(&self) -> PathBuf { self.app_data().join("shelf") }
        fn install(&self) -> PathBuf { self.0.join("install & data") }
    }

    impl Drop for TestTree {
        fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); }
    }

    fn set_age(path: &Path, seconds_ago: u64) {
        std::fs::write(path, current_unix_seconds().saturating_sub(seconds_ago).to_string()).unwrap();
    }

    #[test]
    fn canonical_shelf_is_accepted_and_sibling_or_parent_is_rejected() {
        let tree = TestTree::new();
        let shelf = validate_shelf_root(&tree.app_data(), &tree.shelf()).unwrap();
        assert!(paths_equal_windows(&shelf, &tree.shelf().canonicalize().unwrap()));

        let sibling = tree.app_data().join("Shelf-Other");
        std::fs::create_dir(&sibling).unwrap();
        assert!(validate_shelf_root(&tree.app_data(), &sibling).is_err());
        assert!(validate_shelf_root(&tree.app_data(), &tree.app_data()).is_err());
        assert!(validate_shelf_root(&tree.app_data(), &tree.shelf().join("..").join("Shelf-Other")).is_err());
        assert!(validate_shelf_root(&tree.app_data(), Path::new("")).is_err());
        for general_folder in ["Desktop", "Documents", "Downloads"] {
            let path = tree.0.join(general_folder);
            std::fs::create_dir(&path).unwrap();
            assert!(validate_shelf_root(&tree.app_data(), &path).is_err());
        }
        assert!(validate_shelf_root(&tree.app_data(), &tree.0).is_err());
    }

    #[test]
    fn expiry_removes_only_old_shelf_entries_and_sidecars() {
        let tree = TestTree::new();
        let expired = tree.shelf().join("12345678--expired.txt");
        let fresh = tree.shelf().join("23456789--fresh.txt");
        std::fs::write(&expired, b"old").unwrap();
        std::fs::write(&fresh, b"fresh").unwrap();
        std::fs::write(tree.shelf().join("12345678.name"), "expired.txt").unwrap();
        set_age(&tree.shelf().join("12345678.added"), SHELF_TTL_SECS + 1);
        set_age(&tree.shelf().join("23456789.added"), 60);

        assert_eq!(cleanup_shelf_dir(&tree.shelf().canonicalize().unwrap(), false).unwrap(), 1);
        assert!(!expired.exists());
        assert!(!tree.shelf().join("12345678.name").exists());
        assert!(!tree.shelf().join("12345678.added").exists());
        assert!(fresh.exists());
    }

    #[test]
    fn cleanup_skips_a_symlink_to_a_file_outside_shelf() {
        use std::os::windows::fs::symlink_file;
        let tree = TestTree::new();
        let outside = tree.0.join("outside.txt");
        let link = tree.shelf().join("34567890--linked.txt");
        std::fs::write(&outside, b"keep me").unwrap();
        if let Err(error) = symlink_file(&outside, &link) {
            eprintln!("Skipping symlink cleanup assertion; Windows did not permit test symlink creation: {error}");
            return;
        }
        set_age(&tree.shelf().join("34567890.added"), SHELF_TTL_SECS + 1);
        assert_eq!(cleanup_shelf_dir(&tree.shelf().canonicalize().unwrap(), false).unwrap(), 0);
        assert!(outside.exists());
        assert!(link.exists());
    }

    #[test]
    fn cleanup_does_not_enter_a_junction_to_an_outside_directory() {
        let tree = TestTree::new();
        let outside = tree.0.join("outside-directory");
        std::fs::create_dir(&outside).unwrap();
        let outside_file = outside.join("56789012--expired.txt");
        std::fs::write(&outside_file, b"keep me").unwrap();
        set_age(&outside.join("56789012.added"), SHELF_TTL_SECS + 1);
        let junction = tree.shelf().join("outside-junction");
        let ps_quote = |path: &Path| format!("'{}'", path.to_string_lossy().replace('\'', "''"));
        let junction_command = format!("New-Item -ItemType Junction -Path {} -Target {} -ErrorAction Stop | Out-Null", ps_quote(&junction), ps_quote(&outside));
        let created = Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command", &junction_command])
            .output();
        let output = match created {
            Ok(output) => output,
            Err(error) => {
                eprintln!("Skipping junction assertion; could not start PowerShell: {error}");
                return;
            }
        };
        if !output.status.success() {
            eprintln!("Skipping junction assertion; PowerShell could not create a test junction: {}", String::from_utf8_lossy(&output.stderr));
            return;
        }
        assert_eq!(cleanup_shelf_dir(&tree.shelf().canonicalize().unwrap(), false).unwrap(), 0);
        assert!(outside_file.exists());
        assert!(junction.exists());
    }

    #[test]
    fn legacy_migration_matches_only_the_old_action_in_this_install_and_shelf() {
        let tree = TestTree::new();
        let install = tree.install().canonicalize().unwrap();
        let shelf = tree.shelf().canonicalize().unwrap();
        let command = install.join("winutilx-task1.exe").to_string_lossy().replace('&', "&amp;");
        let args = format!("--utilityx-shelf-cleanup &quot;{}&quot;", shelf.display());
        let xml = format!("<Task><Actions><Exec><Command>{command}</Command><Arguments>{args}</Arguments></Exec></Actions></Task>");
        assert!(should_remove_legacy_task(Some(xml.as_bytes()), &install, &shelf));
        let versioned_command = xml.replace("winutilx-task1.exe", "Ollumi_0.1.0.exe");
        assert!(should_remove_legacy_task(Some(versioned_command.as_bytes()), &install, &shelf));
        assert!(!should_remove_legacy_task(None, &install, &shelf));

        let unrelated = xml.replace("--utilityx-shelf-cleanup", "--other-action");
        assert!(!should_remove_legacy_task(Some(unrelated.as_bytes()), &install, &shelf));
        let other_install = tree.0.join("other-install");
        std::fs::create_dir_all(&other_install).unwrap();
        assert!(!should_remove_legacy_task(Some(xml.as_bytes()), &other_install, &shelf));
        let other_shelf = tree.0.join("other-shelf");
        std::fs::create_dir_all(&other_shelf).unwrap();
        let other_action = xml.replace(&shelf.to_string_lossy().to_string(), &other_shelf.to_string_lossy().to_string());
        assert!(!should_remove_legacy_task(Some(other_action.as_bytes()), &install, &shelf));
    }

    #[test]
    fn migration_marker_makes_the_legacy_check_one_time() {
        let tree = TestTree::new();
        assert!(!migration_was_attempted(&tree.app_data()));
        mark_migration_attempted(&tree.app_data());
        assert!(migration_was_attempted(&tree.app_data()));
        mark_migration_attempted(&tree.app_data());
        assert!(migration_was_attempted(&tree.app_data()));
    }

    #[test]
    fn migration_marker_is_allowed_only_after_absence_or_removal() {
        assert!(should_mark_task_migration(false, false));
        assert!(!should_mark_task_migration(true, false));
        assert!(should_mark_task_migration(true, true));
    }

    #[test]
    fn task_list_csv_matches_only_the_exact_root_task_name() {
        assert!(task_list_contains_legacy_name(b"\"\\UtilityX Shelf Expiry\",\"N/A\",\"Ready\"\r\n"));
        assert!(task_list_contains_legacy_name(b"\"UtilityX Shelf Expiry\",\"N/A\",\"Ready\"\r\n"));
        assert!(!task_list_contains_legacy_name(b"\"\\UtilityX Shelf Expiry Other\",\"N/A\",\"Ready\"\r\n"));
        assert!(!task_list_contains_legacy_name(b"\"\\Other\\UtilityX Shelf Expiry\",\"N/A\",\"Ready\"\r\n"));
    }

    #[test]
    fn repeated_concurrent_cleanup_is_serialized_and_safe() {
        let tree = TestTree::new();
        let expired = tree.shelf().join("45678901--expired.txt");
        std::fs::write(&expired, b"old").unwrap();
        set_age(&tree.shelf().join("45678901.added"), SHELF_TTL_SECS + 1);
        let root = tree.shelf().canonicalize().unwrap();
        let left_root = root.clone();
        let right_root = root.clone();
        let left = std::thread::spawn(move || cleanup_shelf_dir(&left_root, false).unwrap());
        let right = std::thread::spawn(move || cleanup_shelf_dir(&right_root, false).unwrap());
        assert_eq!(left.join().unwrap() + right.join().unwrap(), 1);
        assert!(!expired.exists());
    }
}

