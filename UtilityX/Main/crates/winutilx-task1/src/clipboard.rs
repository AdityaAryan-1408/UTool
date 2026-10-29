use serde::{Deserialize, Serialize};
use std::mem::zeroed;
use std::path::{Path, PathBuf};
use std::ptr::{null, null_mut};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use std::ffi::c_void;
use std::sync::atomic::AtomicBool;
use tauri::{AppHandle, Manager};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::Foundation::GlobalFree;
use windows_sys::Win32::System::DataExchange::{AddClipboardFormatListener, CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard, RemoveClipboardFormatListener, SetClipboardData};
use windows_sys::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE, GMEM_ZEROINIT};
use windows_sys::Win32::UI::WindowsAndMessaging::{CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, RegisterClassW, TranslateMessage, WNDCLASSW, WM_CLIPBOARDUPDATE, WM_QUIT, HWND_MESSAGE};

const CF_UNICODETEXT: u32 = 13;
const CF_DIB: u32 = 8;
const CF_DIBV5: u32 = 17;
const MAX_PREVIEW_CHARS: usize = 160;
const MAX_HISTORY_ITEMS: usize = 500;
const HISTORY_RETENTION_SECS: u64 = 30 * 24 * 60 * 60;
const PROTECTED_PREFIX: &[u8; 5] = b"UXDP1";
static ITEM_COUNTER: AtomicU64 = AtomicU64::new(1);
static STORE_LOCK: Mutex<()> = Mutex::new(());
static OWN_WRITES: OnceLock<Mutex<VecDeque<(String, Vec<u8>)>>> = OnceLock::new();
static CAPTURE_ENABLED: AtomicBool = AtomicBool::new(true);

#[repr(C)]
struct DataBlob { size: u32, data: *mut u8 }

#[link(name = "Crypt32")]
extern "system" {
    fn CryptProtectData(input: *const DataBlob, description: *const u16, entropy: *const DataBlob, reserved: *mut c_void, prompt: *mut c_void, flags: u32, output: *mut DataBlob) -> i32;
    fn CryptUnprotectData(input: *const DataBlob, description: *mut *mut u16, entropy: *const DataBlob, reserved: *mut c_void, prompt: *mut c_void, flags: u32, output: *mut DataBlob) -> i32;
}

#[link(name = "Kernel32")]
extern "system" { fn LocalFree(memory: *mut c_void) -> *mut c_void; }

#[link(name = "user32")]
extern "system" { fn RegisterClipboardFormatW(name: *const u16) -> u32; }

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardItem {
    pub id: String,
    pub kind: String,
    pub preview: String,
    pub copied_at: u64,
    pub bytes: u64,
    #[serde(default = "default_image_format")]
    format: u32,
    file: String,
}

fn default_image_format() -> u32 { CF_DIB }

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app.path().app_data_dir().map_err(|error| format!("Could not locate Ollumi app data: {error}"))?.join("clipboard");
    std::fs::create_dir_all(&path).map_err(|error| format!("Could not create clipboard history: {error}"))?;
    Ok(path)
}

fn index_path(dir: &Path) -> PathBuf { dir.join("history.json") }

fn protect_bytes(clear: &[u8]) -> Result<Vec<u8>, String> {
    const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;
    let mut input_bytes = clear.to_vec();
    let input = DataBlob { size: input_bytes.len() as u32, data: input_bytes.as_mut_ptr() };
    let mut output = DataBlob { size: 0, data: null_mut() };
    let ok = unsafe { CryptProtectData(&input, null(), null(), null_mut(), null_mut(), CRYPTPROTECT_UI_FORBIDDEN, &mut output) };
    input_bytes.fill(0);
    if ok == 0 { return Err("Windows could not encrypt clipboard history for this account.".into()); }
    let mut protected = PROTECTED_PREFIX.to_vec();
    protected.extend_from_slice(unsafe { std::slice::from_raw_parts(output.data, output.size as usize) });
    unsafe { LocalFree(output.data.cast()); }
    Ok(protected)
}

fn unprotect_bytes(protected: &[u8]) -> Result<Vec<u8>, String> {
    const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;
    if !protected.starts_with(PROTECTED_PREFIX) { return Ok(protected.to_vec()); }
    let encrypted = &protected[PROTECTED_PREFIX.len()..];
    let input = DataBlob { size: encrypted.len() as u32, data: encrypted.as_ptr() as *mut u8 };
    let mut output = DataBlob { size: 0, data: null_mut() };
    let ok = unsafe { CryptUnprotectData(&input, null_mut(), null(), null_mut(), null_mut(), CRYPTPROTECT_UI_FORBIDDEN, &mut output) };
    if ok == 0 { return Err("Windows could not decrypt this account's clipboard history.".into()); }
    let clear = unsafe { std::slice::from_raw_parts(output.data, output.size as usize).to_vec() };
    unsafe { LocalFree(output.data.cast()); }
    Ok(clear)
}

fn is_protected_file(bytes: &[u8]) -> bool { bytes.starts_with(PROTECTED_PREFIX) }

fn write_index(dir: &Path, items: &[ClipboardItem]) -> Result<(), String> {
    let mut clear = serde_json::to_vec(items).map_err(|error| error.to_string())?;
    let bytes = protect_bytes(&clear)?;
    clear.fill(0);
    let temporary = dir.join("history.json.tmp");
    std::fs::write(&temporary, bytes).map_err(|error| format!("Could not save clipboard history: {error}"))?;
    std::fs::rename(temporary, index_path(dir)).map_err(|error| format!("Could not update clipboard history: {error}"))
}

fn read_index(dir: &Path) -> Result<Vec<ClipboardItem>, String> {
    let path = index_path(dir);
    let stored = match std::fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("Could not read clipboard history: {error}")),
    };
    let was_protected = is_protected_file(&stored);
    let mut clear = unprotect_bytes(&stored)?;
    let mut items: Vec<ClipboardItem> = serde_json::from_slice(&clear)
        .map_err(|error| format!("Could not decode clipboard history: {error}"))?;
    clear.fill(0);

    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    let cutoff = now.saturating_sub(HISTORY_RETENTION_SECS);
    let old_len = items.len();
    items.retain(|item| item.copied_at >= cutoff && dir.join(&item.file).is_file());
    if items.len() > MAX_HISTORY_ITEMS { items.drain(..items.len() - MAX_HISTORY_ITEMS); }
    let retained: std::collections::HashSet<&str> = items.iter().map(|item| item.file.as_str()).collect();
    let mut changed = !was_protected || items.len() != old_len;
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let file_name = entry.file_name();
            let Some(file_name) = file_name.to_str() else { continue; };
            if (file_name.ends_with(".txt") || file_name.ends_with(".dib")) && !retained.contains(file_name) {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
    for item in &items {
        let item_path = dir.join(&item.file);
        let bytes = std::fs::read(&item_path).map_err(|error| format!("Could not read clipboard history item: {error}"))?;
        if !is_protected_file(&bytes) {
            let protected = protect_bytes(&bytes)?;
            std::fs::write(&item_path, protected).map_err(|error| format!("Could not protect clipboard history item: {error}"))?;
            changed = true;
        }
    }
    if changed { write_index(dir, &items)?; }
    Ok(items)
}

fn notify(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval("window.dispatchEvent(new Event('ollumi-clipboard-history-updated'))");
    }
}

fn read_payload(path: &Path) -> Result<Vec<u8>, String> {
    let stored = std::fs::read(path).map_err(|error| format!("Could not read clipboard item: {error}"))?;
    let was_protected = is_protected_file(&stored);
    let clear = unprotect_bytes(&stored)?;
    if !was_protected {
        std::fs::write(path, protect_bytes(&clear)?).map_err(|error| format!("Could not protect clipboard item: {error}"))?;
    }
    Ok(clear)
}

fn save_capture(app: &AppHandle, kind: &str, format: u32, payload: &[u8], preview: String) -> Result<(), String> {
    if consume_own_write(kind, payload) { return Ok(()); }
    let _guard = STORE_LOCK.lock().map_err(|_| "Clipboard history is temporarily unavailable.".to_string())?;
    let dir = data_dir(app)?;
    let mut items = read_index(&dir)?;
    if let Some(latest) = items.last() {
        if latest.kind == kind {
            if let Ok(previous) = read_payload(&dir.join(&latest.file)) {
                if previous == payload { return Ok(()); }
            }
        }
    }
    let millis = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
    let sequence = ITEM_COUNTER.fetch_add(1, Ordering::Relaxed);
    let id = format!("{millis}-{sequence}");
    let extension = if kind == "image" { "dib" } else { "txt" };
    let file = format!("{id}.{extension}");
    std::fs::write(dir.join(&file), protect_bytes(payload)?).map_err(|error| format!("Could not save clipboard item: {error}"))?;
    items.push(ClipboardItem {
        id,
        kind: kind.to_string(),
        preview,
        copied_at: SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs(),
        bytes: payload.len() as u64,
        format,
        file,
    });
    if items.len() > MAX_HISTORY_ITEMS {
        let removed = items.drain(..items.len() - MAX_HISTORY_ITEMS).collect::<Vec<_>>();
        for item in removed { let _ = std::fs::remove_file(dir.join(item.file)); }
    }
    write_index(&dir, &items)?;
    drop(_guard);
    notify(app);
    Ok(())
}

fn remember_own_write(kind: &str, payload: &[u8]) {
    if let Ok(mut writes) = OWN_WRITES.get_or_init(|| Mutex::new(VecDeque::new())).lock() {
        writes.push_back((kind.to_string(), payload.to_vec()));
        while writes.len() > 64 { writes.pop_front(); }
    }
}

fn consume_own_write(kind: &str, payload: &[u8]) -> bool {
    let Some(writes) = OWN_WRITES.get() else { return false; };
    let Ok(mut writes) = writes.lock() else { return false; };
    if let Some(index) = writes.iter().position(|(written_kind, written)| written_kind == kind && written.as_slice() == payload) {
        writes.remove(index);
        true
    } else { false }
}

fn read_clipboard_memory(format: u32) -> Option<Vec<u8>> {
    unsafe {
        let handle = GetClipboardData(format);
        if handle.is_null() { return None; }
        let size = GlobalSize(handle);
        if size == 0 { return None; }
        let pointer = GlobalLock(handle) as *const u8;
        if pointer.is_null() { return None; }
        let bytes = std::slice::from_raw_parts(pointer, size);
        let result = bytes.to_vec();
        GlobalUnlock(handle);
        Some(result)
    }
}

fn registered_clipboard_format(name: &str) -> u32 {
    let wide: Vec<u16> = name.encode_utf16().chain(Some(0)).collect();
    unsafe { RegisterClipboardFormatW(wide.as_ptr()) }
}

unsafe fn clipboard_has_privacy_marker(name: &str) -> bool {
    let format = registered_clipboard_format(name);
    format != 0 && IsClipboardFormatAvailable(format) != 0
}

unsafe fn should_skip_clipboard_capture() -> bool {
    if clipboard_has_privacy_marker("ExcludeClipboardContentFromMonitorProcessing")
        || clipboard_has_privacy_marker("Clipboard Viewer Ignore") {
        return true;
    }
    let include_format = registered_clipboard_format("CanIncludeInClipboardHistory");
    if include_format != 0 && IsClipboardFormatAvailable(include_format) != 0 {
        return read_clipboard_memory(include_format)
            .and_then(|bytes| {
                let value: [u8; 4] = bytes.get(..4)?.try_into().ok()?;
                Some(u32::from_le_bytes(value))
            })
            .map(|include| include == 0)
            .unwrap_or(true);
    }
    false
}

fn capture_clipboard(app: &AppHandle) {
    if !CAPTURE_ENABLED.load(Ordering::Acquire) { return; }
    unsafe {
        let mut opened = false;
        for _ in 0..8 {
            if OpenClipboard(null_mut()) != 0 { opened = true; break; }
            std::thread::sleep(Duration::from_millis(12));
        }
        if !opened { return; }
        if should_skip_clipboard_capture() {
            CloseClipboard();
            return;
        }

        let image_format = if IsClipboardFormatAvailable(CF_DIBV5) != 0 { CF_DIBV5 }
            else if IsClipboardFormatAvailable(CF_DIB) != 0 { CF_DIB }
            else { 0 };
        let image = if image_format == CF_DIBV5 {
            read_clipboard_memory(CF_DIBV5)
        } else if image_format == CF_DIB {
            read_clipboard_memory(CF_DIB)
        } else { None };

        if let Some(bytes) = image {
            CloseClipboard();
            let _ = save_capture(app, "image", image_format, &bytes, format!("Image · {}", format_bytes(bytes.len() as u64)));
            return;
        }

        if IsClipboardFormatAvailable(CF_UNICODETEXT) != 0 {
            if let Some(bytes) = read_clipboard_memory(CF_UNICODETEXT) {
                let units: Vec<u16> = bytes.chunks_exact(2).map(|pair| u16::from_le_bytes([pair[0], pair[1]])).take_while(|unit| *unit != 0).collect();
                let text = String::from_utf16_lossy(&units);
                CloseClipboard();
                if !text.is_empty() {
                    let preview = text.chars().take(MAX_PREVIEW_CHARS).collect::<String>().replace('\n', " ").replace('\r', " ");
                    let _ = save_capture(app, "text", CF_UNICODETEXT, text.as_bytes(), preview);
                    return;
                }
            }
        }
        CloseClipboard();
    }
}

fn format_bytes(bytes: u64) -> String {
    if bytes < 1024 { format!("{bytes} B") }
    else if bytes < 1024 * 1024 { format!("{:.1} KB", bytes as f64 / 1024.0) }
    else { format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0)) }
}

fn capture_preference_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|error| format!("Could not locate Ollumi app data: {error}"))?.join("clipboard").join("capture-enabled"))
}

#[tauri::command]
pub fn clipboard_capture_status() -> bool { CAPTURE_ENABLED.load(Ordering::Acquire) }

#[tauri::command]
pub fn clipboard_set_capture_enabled(app: AppHandle, enabled: bool) -> Result<(), String> {
    let path = capture_preference_path(&app)?;
    let parent = path.parent().ok_or_else(|| "Could not locate clipboard settings storage.".to_string())?;
    std::fs::create_dir_all(parent).map_err(|error| format!("Could not prepare clipboard settings: {error}"))?;
    std::fs::write(path, if enabled { &b"true"[..] } else { &b"false"[..] })
        .map_err(|error| format!("Could not save clipboard capture preference: {error}"))?;
    CAPTURE_ENABLED.store(enabled, Ordering::Release);
    Ok(())
}

pub fn start_listener(app: AppHandle) {
    if let Ok(path) = capture_preference_path(&app) {
        if let Ok(value) = std::fs::read_to_string(path) {
            CAPTURE_ENABLED.store(value.trim() != "false", Ordering::Release);
        }
    }
    std::thread::spawn(move || {
        if let Ok(_guard) = STORE_LOCK.lock() {
            if let Ok(dir) = data_dir(&app) { let _ = read_index(&dir); }
        }
        unsafe {
        let class_name: Vec<u16> = "UtilityXClipboardMessageWindow".encode_utf16().chain(Some(0)).collect();
        let instance = GetModuleHandleW(null());
        let class = WNDCLASSW {
            style: 0,
            lpfnWndProc: Some(DefWindowProcW),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: instance,
            hIcon: null_mut(),
            hCursor: null_mut(),
            hbrBackground: null_mut(),
            lpszMenuName: null(),
            lpszClassName: class_name.as_ptr(),
        };
        if RegisterClassW(&class) == 0 { return; }
        let hwnd = CreateWindowExW(0, class_name.as_ptr(), class_name.as_ptr(), 0, 0, 0, 0, 0, HWND_MESSAGE, null_mut(), instance, null());
        if hwnd.is_null() || AddClipboardFormatListener(hwnd) == 0 { return; }
        let mut message: windows_sys::Win32::UI::WindowsAndMessaging::MSG = zeroed();
        while GetMessageW(&mut message, hwnd, 0, 0) > 0 {
            if message.message == WM_CLIPBOARDUPDATE {
                capture_clipboard(&app);
            } else if message.message == WM_QUIT { break; }
            TranslateMessage(&message);
            DispatchMessageW(&message);
        }
        RemoveClipboardFormatListener(hwnd);
        }
    });
}

fn find_item(dir: &Path, items: &[ClipboardItem], id: &str) -> Result<(ClipboardItem, Vec<u8>), String> {
    let item = items.iter().find(|item| item.id == id).cloned().ok_or("Clipboard item was not found.")?;
    let bytes = read_payload(&dir.join(&item.file))?;
    Ok((item, bytes))
}

fn base64_encode(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity((input.len() + 2) / 3 * 4);
    for chunk in input.chunks(3) {
        let a = chunk[0] as u32;
        let b = chunk.get(1).copied().unwrap_or(0) as u32;
        let c = chunk.get(2).copied().unwrap_or(0) as u32;
        let value = (a << 16) | (b << 8) | c;
        output.push(TABLE[((value >> 18) & 63) as usize] as char);
        output.push(TABLE[((value >> 12) & 63) as usize] as char);
        output.push(if chunk.len() > 1 { TABLE[((value >> 6) & 63) as usize] as char } else { '=' });
        output.push(if chunk.len() > 2 { TABLE[(value & 63) as usize] as char } else { '=' });
    }
    output
}

fn dib_to_bmp(dib: &[u8]) -> Result<Vec<u8>, String> {
    if dib.len() < 12 { return Err("The copied image data is incomplete.".into()); }
    let read_u16 = |offset: usize| u16::from_le_bytes([dib[offset], dib[offset + 1]]);
    let read_u32 = |offset: usize| u32::from_le_bytes([dib[offset], dib[offset + 1], dib[offset + 2], dib[offset + 3]]);
    let header_size = read_u32(0) as usize;
    let mut pixel_offset = header_size;
    let (bit_count, colors_used) = if header_size == 12 {
        (read_u16(10), 0usize)
    } else if header_size >= 40 && dib.len() >= 40 {
        let bit_count = read_u16(14);
        let compression = read_u32(16);
        if header_size == 40 && compression == 3 { pixel_offset += 12; }
        if header_size == 40 && compression == 6 { pixel_offset += 16; }
        (bit_count, read_u32(32) as usize)
    } else { return Err("This copied image format cannot be previewed.".into()); };
    if bit_count <= 8 {
        let palette_entries = if colors_used > 0 { colors_used } else { 1usize << bit_count };
        pixel_offset = pixel_offset.saturating_add(palette_entries.saturating_mul(if header_size == 12 { 3 } else { 4 }));
    }
    if pixel_offset > dib.len() || dib.len().saturating_add(14) > u32::MAX as usize || pixel_offset + 14 > u32::MAX as usize {
        return Err("The copied image data is not a valid previewable bitmap.".into());
    }
    let mut bmp = Vec::with_capacity(dib.len() + 14);
    bmp.extend_from_slice(b"BM");
    bmp.extend_from_slice(&((dib.len() + 14) as u32).to_le_bytes());
    bmp.extend_from_slice(&[0; 4]);
    bmp.extend_from_slice(&((pixel_offset + 14) as u32).to_le_bytes());
    bmp.extend_from_slice(dib);
    Ok(bmp)
}

#[tauri::command]
pub fn clipboard_image_preview(app: AppHandle, id: String) -> Result<String, String> {
    let _guard = STORE_LOCK.lock().map_err(|_| "Clipboard history is temporarily unavailable.".to_string())?;
    let dir = data_dir(&app)?;
    let (item, bytes) = find_item(&dir, &read_index(&dir)?, &id)?;
    if item.kind != "image" { return Err("This clipboard item is not an image.".into()); }
    let bmp = dib_to_bmp(&bytes)?;
    Ok(format!("data:image/bmp;base64,{}", base64_encode(&bmp)))
}

unsafe fn put_clipboard_data(format: u32, bytes: &[u8]) -> Result<(), String> {
    if OpenClipboard(null_mut()) == 0 { return Err("Windows clipboard is temporarily unavailable.".into()); }
    let memory = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, bytes.len());
    if memory.is_null() { CloseClipboard(); return Err("Could not allocate clipboard data.".into()); }
    let pointer = GlobalLock(memory) as *mut u8;
    if pointer.is_null() { GlobalFree(memory); CloseClipboard(); return Err("Could not prepare clipboard data.".into()); }
    std::ptr::copy_nonoverlapping(bytes.as_ptr(), pointer, bytes.len());
    GlobalUnlock(memory);
    windows_sys::Win32::System::DataExchange::EmptyClipboard();
    if SetClipboardData(format, memory).is_null() {
        GlobalFree(memory);
        CloseClipboard();
        return Err("Windows could not set clipboard data.".into());
    }
    CloseClipboard();
    Ok(())
}

fn set_item_clipboard(item: &ClipboardItem, bytes: &[u8]) -> Result<(), String> {
    unsafe {
        if item.kind == "image" {
            remember_own_write("image", bytes);
            put_clipboard_data(item.format, bytes)
        }
        else {
            let mut wide: Vec<u16> = String::from_utf8_lossy(bytes).encode_utf16().collect();
            wide.push(0);
            let payload = std::slice::from_raw_parts(wide.as_ptr() as *const u8, wide.len() * 2);
            remember_own_write("text", bytes);
            put_clipboard_data(CF_UNICODETEXT, payload)
        }
    }
}

#[tauri::command]
pub fn clipboard_list_items(app: AppHandle) -> Result<Vec<ClipboardItem>, String> {
    let _guard = STORE_LOCK.lock().map_err(|_| "Clipboard history is temporarily unavailable.".to_string())?;
    let dir = data_dir(&app)?;
    read_index(&dir)
}

#[tauri::command]
pub fn clipboard_read_item(app: AppHandle, id: String) -> Result<String, String> {
    let _guard = STORE_LOCK.lock().map_err(|_| "Clipboard history is temporarily unavailable.".to_string())?;
    let dir = data_dir(&app)?;
    let (item, bytes) = find_item(&dir, &read_index(&dir)?, &id)?;
    if item.kind != "text" { return Err("This clipboard item is an image.".into()); }
    String::from_utf8(bytes).map_err(|error| format!("Could not decode clipboard text: {error}"))
}

#[tauri::command]
pub fn clipboard_copy_item(app: AppHandle, id: String) -> Result<(), String> {
    let _guard = STORE_LOCK.lock().map_err(|_| "Clipboard history is temporarily unavailable.".to_string())?;
    let dir = data_dir(&app)?;
    let (item, bytes) = find_item(&dir, &read_index(&dir)?, &id)?;
    set_item_clipboard(&item, &bytes)
}

#[tauri::command]
pub fn clipboard_delete_item(app: AppHandle, id: String) -> Result<(), String> {
    let _guard = STORE_LOCK.lock().map_err(|_| "Clipboard history is temporarily unavailable.".to_string())?;
    let dir = data_dir(&app)?;
    let mut items = read_index(&dir)?;
    let Some(index) = items.iter().position(|item| item.id == id) else { return Err("Clipboard item was not found.".into()); };
    let item = items.remove(index);
    let _ = std::fs::remove_file(dir.join(item.file));
    write_index(&dir, &items)?;
    drop(_guard);
    notify(&app);
    Ok(())
}

#[tauri::command]
pub fn clipboard_clear(app: AppHandle) -> Result<(), String> {
    let _guard = STORE_LOCK.lock().map_err(|_| "Clipboard history is temporarily unavailable.".to_string())?;
    let dir = data_dir(&app)?;
    let items = read_index(&dir)?;
    for item in items { let _ = std::fs::remove_file(dir.join(item.file)); }
    write_index(&dir, &[])?;
    drop(_guard);
    notify(&app);
    Ok(())
}

pub fn batch_paste(app: &AppHandle) -> Result<usize, String> {
    let mut items = clipboard_list_items(app.clone())?;
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    items.retain(|item| now.saturating_sub(item.copied_at) <= 60);
    if items.len() > 5 { items.drain(..items.len() - 5); }
    if items.is_empty() { return Ok(0); }
    let dir = data_dir(app)?;
    for item in &items {
        let bytes = read_payload(&dir.join(&item.file))?;
        set_item_clipboard(item, &bytes)?;
        std::thread::sleep(Duration::from_millis(120));
        unsafe {
            keybd_event(0x11, 0, 0, 0);
            keybd_event(0x56, 0, 0, 0);
            keybd_event(0x56, 0, 2, 0);
            keybd_event(0x11, 0, 2, 0);
        }
        std::thread::sleep(Duration::from_millis(280));
    }
    Ok(items.len())
}

#[link(name = "user32")]
extern "system" {
    fn keybd_event(vk: u8, scan: u8, flags: u32, extra_info: usize);
}

