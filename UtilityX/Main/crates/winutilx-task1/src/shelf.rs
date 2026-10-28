use std::mem::size_of;
use std::os::windows::ffi::OsStringExt;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::ptr::{null, null_mut};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use windows_sys::Win32::Foundation::GlobalFree;
use windows_sys::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE, GMEM_ZEROINIT};
use windows_sys::Win32::System::DataExchange::{CloseClipboard, EmptyClipboard, GetClipboardData, OpenClipboard, SetClipboardData};
use windows_sys::Win32::UI::Shell::{DragQueryFileW, DROPFILES};
use windows_sys::Win32::UI::Controls::Dialogs::{GetSaveFileNameW, CommDlgExtendedError, OPENFILENAMEW, OFN_EXPLORER, OFN_NOCHANGEDIR, OFN_OVERWRITEPROMPT, OFN_PATHMUSTEXIST};

const SHELF_TTL_SECS: u64 = 3 * 24 * 60 * 60;
const SHELF_CLEANUP_TASK: &str = "UtilityX Shelf Expiry";
static SHELF_ID_COUNTER: AtomicU64 = AtomicU64::new(1);
static EXPIRY_TASK_READY: AtomicBool = AtomicBool::new(false);

fn shelf_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|error| format!("Could not locate UtilityX app data: {error}"))?.join("shelf");
    std::fs::create_dir_all(&dir).map_err(|error| format!("Could not create the Shelf storage folder: {error}"))?;
    Ok(dir)
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

fn cleanup_expired_in(dir: &Path) -> Result<usize, String> {
    if !dir.exists() { return Ok(0); }
    let now = current_unix_seconds();
    let mut removed = 0;
    for entry in std::fs::read_dir(dir).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if !path.is_file() { continue; }
        let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else { continue; };
        let Some((id, _)) = file_name.split_once("--") else { continue; };
        if validate_id(id).is_err() { continue; }
        let added_at = std::fs::read_to_string(item_added_path(dir, id))
            .ok()
            .and_then(|value| value.trim().parse::<u64>().ok())
            .or_else(|| path.metadata().ok()?.modified().ok()?.duration_since(UNIX_EPOCH).ok().map(|time| time.as_secs()))
            .unwrap_or(now);
        if now.saturating_sub(added_at) >= SHELF_TTL_SECS {
            std::fs::remove_file(&path).map_err(|error| error.to_string())?;
            for suffix in ["name", "added"] {
                let sidecar = dir.join(format!("{id}.{suffix}"));
                if sidecar.exists() { std::fs::remove_file(sidecar).map_err(|error| error.to_string())?; }
            }
            removed += 1;
        }
    }
    Ok(removed)
}

fn ensure_expiry_task(shelf_path: &Path) -> Result<(), String> {
    if EXPIRY_TASK_READY.load(Ordering::Acquire) { return Ok(()); }
    let executable = std::env::current_exe().map_err(|error| format!("Could not locate UtilityX for expiry scheduling: {error}"))?;
    let action = format!("\"{}\" --utilityx-shelf-cleanup \"{}\"", executable.display(), shelf_path.display());
    let result = Command::new("schtasks.exe")
        .args(["/Create", "/F", "/SC", "MINUTE", "/MO", "10", "/TN", SHELF_CLEANUP_TASK, "/TR", &action])
        .creation_flags(0x08000000)
        .output()
        .map_err(|error| format!("Could not start Windows Task Scheduler: {error}"))?;
    if !result.status.success() {
        let detail = String::from_utf8_lossy(&result.stderr).trim().to_string();
        return Err(if detail.is_empty() { "Windows could not schedule automatic Shelf cleanup.".into() } else { format!("Windows could not schedule automatic Shelf cleanup: {detail}") });
    }
    EXPIRY_TASK_READY.store(true, Ordering::Release);
    Ok(())
}

fn remove_expiry_task() {
    let _ = Command::new("schtasks.exe")
        .args(["/Delete", "/F", "/TN", SHELF_CLEANUP_TASK])
        .creation_flags(0x08000000)
        .output();
    EXPIRY_TASK_READY.store(false, Ordering::Release);
}

fn has_shelf_items(dir: &Path) -> bool {
    let Ok(entries) = std::fs::read_dir(dir) else { return false; };
    entries.flatten().any(|entry| {
        let path = entry.path();
        path.is_file() && path.file_name().and_then(|name| name.to_str()).is_some_and(|name| {
            name.split_once("--").is_some_and(|(id, _)| validate_id(id).is_ok())
        })
    })
}

pub fn cleanup_expired_shelf_for_current_user() -> Result<usize, String> {
    let app_data = std::env::var_os("APPDATA").ok_or("Windows AppData location is unavailable.")?;
    let dir = PathBuf::from(app_data).join("com.winutilx.desktop").join("shelf");
    cleanup_expired_shelf_at_path(&dir)
}

pub fn cleanup_expired_shelf_at_path(dir: &Path) -> Result<usize, String> {
    let removed = cleanup_expired_in(dir)?;
    if !has_shelf_items(dir) { remove_expiry_task(); }
    Ok(removed)
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
    cleanup_expired_in(&dir)?;
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
    if paths.iter().any(|path| path.is_file()) { ensure_expiry_task(&dir)?; }
    cleanup_expired_in(&dir)?;
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
    cleanup_expired_in(&dir)?;
    if has_shelf_items(&dir) { ensure_expiry_task(&dir)?; }
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
    ensure_expiry_task(&dir)?;
    cleanup_expired_in(&dir)?;
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
    if !has_shelf_items(&shelf_dir(&app)?) { remove_expiry_task(); }
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
    remove_expiry_task();
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

