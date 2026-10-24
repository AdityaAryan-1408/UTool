use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;
use std::os::windows::ffi::{OsStrExt, OsStringExt};
use windows_sys::Win32::UI::WindowsAndMessaging::{SystemParametersInfoW, SPI_SETDESKWALLPAPER, SPIF_SENDCHANGE, SPIF_UPDATEINIFILE};
use windows_sys::Win32::UI::Controls::Dialogs::{CommDlgExtendedError, GetSaveFileNameW, OPENFILENAMEW, OFN_EXPLORER, OFN_NOCHANGEDIR, OFN_OVERWRITEPROMPT, OFN_PATHMUSTEXIST};
use windows_sys::Win32::Networking::WinHttp::{WinHttpCloseHandle, WinHttpConnect, WinHttpOpen, WinHttpOpenRequest, WinHttpQueryDataAvailable, WinHttpQueryHeaders, WinHttpReadData, WinHttpReceiveResponse, WinHttpSendRequest, WinHttpSetTimeouts, WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_FLAG_SECURE, WINHTTP_QUERY_FLAG_NUMBER, WINHTTP_QUERY_STATUS_CODE};
use std::ptr::null_mut;
use std::time::{SystemTime, UNIX_EPOCH};
use windows_sys::Win32::System::SystemInformation::GetLocalTime;
use windows_sys::Win32::Foundation::SYSTEMTIME;

const MAX_IMAGE_BYTES: usize = 20 * 1024 * 1024;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WallpaperCycleSettings {
    enabled: bool,
    selected_ids: Vec<String>,
    mode: String,
    interval_minutes: u32,
    daily_time: String,
}

impl Default for WallpaperCycleSettings {
    fn default() -> Self { Self { enabled: false, selected_ids: Vec::new(), mode: "interval".into(), interval_minutes: 60, daily_time: "09:00".into() } }
}

#[derive(Default, Serialize, Deserialize)]
struct WallpaperCycleState { last_interval_epoch: u64, last_daily_key: String, next_index: usize }

fn cycle_settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> { Ok(wallpaper_dir(app)?.join("cycle-settings.json")) }
fn cycle_state_path(app: &tauri::AppHandle) -> Result<PathBuf, String> { Ok(wallpaper_dir(app)?.join("cycle-state.json")) }

fn read_cycle_settings(app: &tauri::AppHandle) -> WallpaperCycleSettings {
    cycle_settings_path(app).ok().and_then(|path| std::fs::read(path).ok()).and_then(|bytes| serde_json::from_slice(&bytes).ok()).unwrap_or_default()
}

#[tauri::command]
pub fn wallpaper_get_cycle_settings(app: tauri::AppHandle) -> WallpaperCycleSettings { read_cycle_settings(&app) }

#[tauri::command]
pub fn wallpaper_set_cycle_settings(app: tauri::AppHandle, settings: WallpaperCycleSettings) -> Result<(), String> {
    if !["interval", "daily"].contains(&settings.mode.as_str()) { return Err("Choose an interval or daily schedule.".into()); }
    if !(15..=1440).contains(&settings.interval_minutes) { return Err("Cycle interval must be between 15 minutes and 24 hours.".into()); }
    if settings.daily_time.len() != 5 || !settings.daily_time.is_char_boundary(2) || &settings.daily_time[2..3] != ":" { return Err("Choose a valid daily time.".into()); }
    let Some((hour, minute)) = settings.daily_time.split_once(':').and_then(|(h, m)| Some((h.parse::<u8>().ok()?, m.parse::<u8>().ok()?))) else { return Err("Choose a valid daily time.".into()); };
    if hour > 23 || minute > 59 { return Err("Choose a valid daily time.".into()); }
    if settings.enabled && settings.selected_ids.len() < 2 { return Err("Select at least two wallpapers to enable cycling.".into()); }
    let dir = wallpaper_dir(&app)?;
    for id in &settings.selected_ids {
        let filename = std::path::Path::new(id).file_name().and_then(|value| value.to_str()).ok_or("Invalid wallpaper identifier")?;
        if filename != id || id.contains("..") || !dir.join(filename).is_file() { return Err("One selected wallpaper is missing from local storage.".into()); }
    }
    std::fs::write(cycle_settings_path(&app)?, serde_json::to_vec(&settings).map_err(|error| error.to_string())?).map_err(|error| format!("Could not save wallpaper cycling settings: {error}"))
}

pub fn start_cycle_scheduler(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        let settings = read_cycle_settings(&app);
        if settings.enabled && settings.selected_ids.len() >= 2 {
            let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
            let mut state = cycle_state_path(&app).ok().and_then(|path| std::fs::read(path).ok()).and_then(|bytes| serde_json::from_slice::<WallpaperCycleState>(&bytes).ok()).unwrap_or_default();
            let due = if settings.mode == "daily" {
                let mut local: SYSTEMTIME = unsafe { std::mem::zeroed() };
                unsafe { GetLocalTime(&mut local); }
                let day = format!("{:04}-{:02}-{:02}", local.wYear, local.wMonth, local.wDay);
                let hhmm = format!("{:02}:{:02}", local.wHour, local.wMinute);
                hhmm >= settings.daily_time && day != state.last_daily_key
            } else { now.saturating_sub(state.last_interval_epoch) >= u64::from(settings.interval_minutes) * 60 };
            if due {
                let index = state.next_index % settings.selected_ids.len();
                let path = wallpaper_dir(&app).ok().map(|dir| dir.join(&settings.selected_ids[index]));
                if let Some(path) = path.filter(|path| path.is_file()) {
                    if apply_wallpaper_path(&path).is_ok() {
                        state.next_index = (index + 1) % settings.selected_ids.len();
                        if settings.mode == "daily" { let mut local: SYSTEMTIME = unsafe { std::mem::zeroed() }; unsafe { GetLocalTime(&mut local); } state.last_daily_key = format!("{:04}-{:02}-{:02}", local.wYear, local.wMonth, local.wDay); }
                        else { state.last_interval_epoch = now; }
                        if let Ok(path) = cycle_state_path(&app) { if let Ok(bytes) = serde_json::to_vec(&state) { let _ = std::fs::write(path, bytes); } }
                    }
                }
            }
        }
        std::thread::sleep(std::time::Duration::from_secs(30));
    });
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalWallpaper {
    id: String,
    name: String,
    size_bytes: u64,
    preview_data_url: Option<String>,
}

fn wallpaper_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|error| format!("Could not locate UtilityX app data: {error}"))?.join("wallpapers");
    std::fs::create_dir_all(&dir).map_err(|error| format!("Could not create the wallpaper folder: {error}"))?;
    Ok(dir)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlineWallpaper {
    id: String,
    title: String,
    location: String,
    url: String,
    full_url: String,
}

#[tauri::command]
pub async fn wallpaper_fetch_online(category: String, query: String) -> Result<Vec<OnlineWallpaper>, String> {
    tauri::async_runtime::spawn_blocking(move || fetch_online_blocking(&category, &query)).await
        .map_err(|error| format!("The online wallpaper worker stopped: {error}"))?
}

fn fetch_online_blocking(category: &str, query: &str) -> Result<Vec<OnlineWallpaper>, String> {
    let category_filter = match category {
        "all" => "111",
        "general" => "100",
        "anime" => "010",
        "people" => "001",
        _ => return Err("Choose a valid wallpaper category.".into()),
    };
    let query = query.trim();
    if query.chars().count() > 100 || query.chars().any(char::is_control) {
        return Err("Search terms must be 100 characters or fewer and contain no control characters.".into());
    }
    let encoded_query = percent_encode_query(query);
    let agent: Vec<u16> = "UtilityX Wallpaper Browser".encode_utf16().chain(Some(0)).collect();
    let host: Vec<u16> = "wallhaven.cc".encode_utf16().chain(Some(0)).collect();
    let query_parameter = if encoded_query.is_empty() { String::new() } else { format!("&q={encoded_query}") };
    let path: Vec<u16> = format!("/api/v1/search?sorting=random&purity=100&categories={category_filter}&atleast=1920x1080{query_parameter}").encode_utf16().chain(Some(0)).collect();
    let mut output = Vec::new();
    unsafe {
        let session = WinHttpOpen(agent.as_ptr(), WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, null_mut(), null_mut(), 0);
        if session.is_null() { return Err(format!("Could not start the wallpaper request (Windows error {}).", windows_sys::Win32::Foundation::GetLastError())); }
        WinHttpSetTimeouts(session, 6000, 8000, 10000, 15000);
        let connection = WinHttpConnect(session, host.as_ptr(), 443, 0);
        if connection.is_null() { WinHttpCloseHandle(session); return Err(format!("Could not connect to Wallhaven (Windows error {}).", windows_sys::Win32::Foundation::GetLastError())); }
        let get: Vec<u16> = "GET".encode_utf16().chain(Some(0)).collect();
        let version: Vec<u16> = "HTTP/1.1".encode_utf16().chain(Some(0)).collect();
        let request = WinHttpOpenRequest(connection, get.as_ptr(), path.as_ptr(), version.as_ptr(), null_mut(), null_mut(), WINHTTP_FLAG_SECURE);
        if request.is_null() { WinHttpCloseHandle(connection); WinHttpCloseHandle(session); return Err(format!("Could not open the wallpaper request (Windows error {}).", windows_sys::Win32::Foundation::GetLastError())); }
        let sent = WinHttpSendRequest(request, null_mut(), 0, null_mut(), 0, 0, 0);
        let received = sent != 0 && WinHttpReceiveResponse(request, null_mut()) != 0;
        let mut result = if received { Ok(()) } else { Err(format!("Wallhaven did not respond (Windows error {}).", windows_sys::Win32::Foundation::GetLastError())) };
        if result.is_ok() {
            let mut status = 0u32;
            let mut status_size = std::mem::size_of::<u32>() as u32;
            if WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, null_mut(), (&mut status as *mut u32).cast(), &mut status_size, null_mut()) == 0 {
                result = Err(format!("Could not read the Wallhaven response (Windows error {}).", windows_sys::Win32::Foundation::GetLastError()));
            } else if !(200..300).contains(&status) { result = Err(format!("Wallhaven returned HTTP {status}.")); }
        }
        if result.is_ok() {
            loop {
                let mut available = 0u32;
                if WinHttpQueryDataAvailable(request, &mut available) == 0 { result = Err(format!("Could not read the wallpaper response (Windows error {}).", windows_sys::Win32::Foundation::GetLastError())); break; }
                if available == 0 { break; }
                if output.len().saturating_add(available as usize) > 2_000_000 { result = Err("Wallpaper response was unexpectedly large.".into()); break; }
                let old = output.len(); output.resize(old + available as usize, 0);
                let mut read = 0u32;
                if WinHttpReadData(request, output[old..].as_mut_ptr().cast(), available, &mut read) == 0 { result = Err(format!("Could not download the wallpaper list (Windows error {}).", windows_sys::Win32::Foundation::GetLastError())); break; }
                output.truncate(old + read as usize);
                if read == 0 { break; }
            }
        }
        WinHttpCloseHandle(request); WinHttpCloseHandle(connection); WinHttpCloseHandle(session);
        result?;
    }
    let payload: serde_json::Value = serde_json::from_slice(&output).map_err(|error| format!("Wallhaven returned invalid data: {error}"))?;
    let items = payload.get("data").and_then(|value| value.as_array()).ok_or("Wallhaven did not include wallpaper results.")?;
    let result: Vec<OnlineWallpaper> = items.iter().take(7).filter_map(|item| {
        let id = item.get("id")?.as_str()?;
        let title = item.get("tags").and_then(|tags| tags.as_array()).map(|tags| {
            tags.iter().filter_map(|tag| tag.get("name").and_then(|name| name.as_str())).take(3).collect::<Vec<_>>().join(" · ")
        }).filter(|title| !title.is_empty()).unwrap_or_else(|| format!("Wallpaper {id}"));
        let location = item.get("resolution")?.as_str()?.to_string();
        let url = item.get("thumbs")?.get("large")?.as_str()?.to_string();
        let full_url = item.get("path")?.as_str()?.to_string();
        Some(OnlineWallpaper { id: id.to_string(), title, location, url, full_url })
    }).collect();
    if result.is_empty() { return Err("Wallhaven returned no usable wallpaper images.".into()); }
    Ok(result)
}

fn percent_encode_query(query: &str) -> String {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    let mut encoded = String::with_capacity(query.len());
    for byte in query.bytes() {
        if byte.is_ascii_alphanumeric() || b"-_.~".contains(&byte) {
            encoded.push(byte as char);
        } else {
            encoded.push('%');
            encoded.push(HEX[(byte >> 4) as usize] as char);
            encoded.push(HEX[(byte & 0x0f) as usize] as char);
        }
    }
    encoded
}

#[tauri::command]
pub async fn wallpaper_save_online(app: tauri::AppHandle, id: String, url: String, thumbnail_url: String, apply: bool) -> Result<LocalWallpaper, String> {
    tauri::async_runtime::spawn_blocking(move || save_online_blocking(app, id, url, thumbnail_url, apply)).await
        .map_err(|error| format!("The online wallpaper worker stopped: {error}"))?
}

fn download_wallhaven_url(url: &str, max_bytes: usize) -> Result<(String, Vec<u8>), String> {
    let rest = url.strip_prefix("https://").ok_or("Wallpaper image URL must use HTTPS.")?;
    let (host, path) = rest.split_once('/').ok_or("Invalid wallpaper image URL.")?;
    if !["w.wallhaven.cc", "th.wallhaven.cc", "wallhaven.cc"].contains(&host) { return Err("Wallpaper image host is not allowed.".into()); }
    let path = format!("/{path}");
    let agent: Vec<u16> = "UtilityX Wallpaper Download".encode_utf16().chain(Some(0)).collect();
    let host_w: Vec<u16> = host.encode_utf16().chain(Some(0)).collect();
    let path_w: Vec<u16> = path.encode_utf16().chain(Some(0)).collect();
    let mut body = Vec::new();
    unsafe {
        let session = WinHttpOpen(agent.as_ptr(), WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, null_mut(), null_mut(), 0);
        if session.is_null() { return Err("Could not start the wallpaper download.".into()); }
        WinHttpSetTimeouts(session, 6000, 8000, 10000, 20000);
        let connection = WinHttpConnect(session, host_w.as_ptr(), 443, 0);
        if connection.is_null() { WinHttpCloseHandle(session); return Err(format!("Could not connect to the wallpaper image host (Windows error {}).", windows_sys::Win32::Foundation::GetLastError())); }
        let get: Vec<u16> = "GET".encode_utf16().chain(Some(0)).collect();
        let version: Vec<u16> = "HTTP/1.1".encode_utf16().chain(Some(0)).collect();
        let request = WinHttpOpenRequest(connection, get.as_ptr(), path_w.as_ptr(), version.as_ptr(), null_mut(), null_mut(), WINHTTP_FLAG_SECURE);
        if request.is_null() { WinHttpCloseHandle(connection); WinHttpCloseHandle(session); return Err("Could not open the wallpaper image request.".into()); }
        let ok = WinHttpSendRequest(request, null_mut(), 0, null_mut(), 0, 0, 0) != 0 && WinHttpReceiveResponse(request, null_mut()) != 0;
        let mut result = if ok { Ok(()) } else { Err(format!("Wallpaper download failed (Windows error {}).", windows_sys::Win32::Foundation::GetLastError())) };
        if result.is_ok() {
            let mut status = 0u32; let mut size = std::mem::size_of::<u32>() as u32;
            if WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, null_mut(), (&mut status as *mut u32).cast(), &mut size, null_mut()) == 0 || !(200..300).contains(&status) { result = Err(format!("Wallpaper image server returned HTTP {status}.")); }
        }
        while result.is_ok() {
            let mut available = 0u32;
            if WinHttpQueryDataAvailable(request, &mut available) == 0 { result = Err("Could not read the wallpaper image download.".into()); break; }
            if available == 0 { break; }
            if body.len().saturating_add(available as usize) > max_bytes { result = Err("Wallpaper image exceeds the download size limit.".into()); break; }
            let old = body.len(); body.resize(old + available as usize, 0);
            let mut read = 0u32;
            if WinHttpReadData(request, body[old..].as_mut_ptr().cast(), available, &mut read) == 0 { result = Err("Wallpaper image download was interrupted.".into()); break; }
            body.truncate(old + read as usize); if read == 0 { break; }
        }
        WinHttpCloseHandle(request); WinHttpCloseHandle(connection); WinHttpCloseHandle(session); result?;
    }
    Ok((path, body))
}

fn save_online_blocking(app: tauri::AppHandle, id: String, url: String, thumbnail_url: String, apply: bool) -> Result<LocalWallpaper, String> {
    if id.is_empty() || !id.chars().all(|ch| ch.is_ascii_alphanumeric()) { return Err("Invalid online wallpaper ID.".into()); }
    let (source_path, bytes) = download_wallhaven_url(&url, MAX_IMAGE_BYTES)?;
    let extension = std::path::Path::new(source_path.split('?').next().unwrap_or(&source_path)).extension().and_then(|ext| ext.to_str()).filter(|ext| ["jpg", "jpeg", "png", "webp", "bmp"].iter().any(|allowed| ext.eq_ignore_ascii_case(allowed))).unwrap_or("jpg");
    let name = format!("online-{id}.{extension}");
    let path = wallpaper_dir(&app)?.join(&name);
    std::fs::write(&path, &bytes).map_err(|error| format!("Could not save the online wallpaper: {error}"))?;
    let preview_data_url = match download_wallhaven_url(&thumbnail_url, 200_000) {
        Ok((_, preview)) if !preview.is_empty() => { std::fs::write(path.with_file_name(format!("{name}.thumb.jpg")), &preview).ok(); Some(format!("data:image/jpeg;base64,{}", encode_base64(&preview))) },
        _ => None,
    };
    if apply { apply_wallpaper_path(&path)?; }
    Ok(LocalWallpaper { id: name.clone(), name, size_bytes: bytes.len() as u64, preview_data_url })
}

fn safe_extension(name: &str) -> Result<&str, String> {
    let extension = std::path::Path::new(name).extension().and_then(|ext| ext.to_str()).unwrap_or("");
    if ["jpg", "jpeg", "png", "webp", "bmp"].iter().any(|allowed| extension.eq_ignore_ascii_case(allowed)) {
        Ok(extension)
    } else {
        Err("Choose a JPG, PNG, WebP, or BMP image.".into())
    }
}

#[tauri::command]
pub fn wallpaper_list_local(app: tauri::AppHandle) -> Result<Vec<LocalWallpaper>, String> {
    let dir = wallpaper_dir(&app)?;
    let mut items = Vec::new();
    for entry in std::fs::read_dir(dir).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if !path.is_file() { continue; }
        let Some(name) = path.file_name().and_then(|name| name.to_str()).map(str::to_owned) else { continue; };
        if name.to_ascii_lowercase().ends_with(".thumb.jpg") || safe_extension(&name).is_err() { continue; }
        let size_bytes = path.metadata().map_err(|error| error.to_string())?.len();
        let preview_data_url = std::fs::read(path.with_file_name(format!("{name}.thumb.jpg"))).ok()
            .map(|bytes| format!("data:image/jpeg;base64,{}", encode_base64(&bytes)));
        items.push(LocalWallpaper { id: name.clone(), name, size_bytes, preview_data_url });
    }
    items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(items)
}

#[tauri::command]
pub fn wallpaper_import_local(app: tauri::AppHandle, name: String, bytes: Vec<u8>, preview_base64: String) -> Result<LocalWallpaper, String> {
    let extension = safe_extension(&name)?;
    if bytes.is_empty() || bytes.len() > MAX_IMAGE_BYTES { return Err("Images must be between 1 byte and 20 MB.".into()); }
    let base_name = std::path::Path::new(&name).file_stem().and_then(|name| name.to_str()).unwrap_or("wallpaper");
    let safe_name: String = base_name.chars().filter(|ch| ch.is_ascii_alphanumeric() || *ch == '-' || *ch == '_').take(60).collect();
    let safe_name = if safe_name.is_empty() { "wallpaper" } else { &safe_name };
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis();
    let stored_name = format!("{stamp}-{safe_name}.{extension}");
    let path = wallpaper_dir(&app)?.join(&stored_name);
    std::fs::write(&path, &bytes).map_err(|error| format!("Could not save wallpaper: {error}"))?;
    let preview = decode_base64(&preview_base64).map_err(|_| "Could not create a preview for this image.".to_string())?;
    if preview.len() > 200_000 { let _ = std::fs::remove_file(path); return Err("Wallpaper preview exceeded the size limit.".into()); }
    std::fs::write(path.with_file_name(format!("{stored_name}.thumb.jpg")), preview).map_err(|error| format!("Could not save wallpaper preview: {error}"))?;
    Ok(LocalWallpaper { id: stored_name.clone(), name: stored_name, size_bytes: bytes.len() as u64, preview_data_url: None })
}

#[tauri::command]
pub fn wallpaper_delete_local(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let filename = std::path::Path::new(&id).file_name().and_then(|value| value.to_str()).ok_or("Invalid wallpaper identifier")?;
    if filename != id || id.contains("..") { return Err("Invalid wallpaper identifier".into()); }
    let image_path = wallpaper_dir(&app)?.join(filename);
    if image_path.exists() { std::fs::remove_file(&image_path).map_err(|error| format!("Could not delete wallpaper: {error}"))?; }
    let preview_path = image_path.with_file_name(format!("{filename}.thumb.jpg"));
    if preview_path.exists() { std::fs::remove_file(preview_path).map_err(|error| format!("Could not delete wallpaper preview: {error}"))?; }
    Ok(())
}

#[tauri::command]
pub fn wallpaper_set_local(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let filename = std::path::Path::new(&id).file_name().and_then(|value| value.to_str()).ok_or("Invalid wallpaper identifier")?;
    if filename != id || id.contains("..") { return Err("Invalid wallpaper identifier".into()); }
    safe_extension(filename)?;
    let path = wallpaper_dir(&app)?.join(filename);
    if !path.is_file() { return Err("That wallpaper is no longer in UtilityX storage.".into()); }
    apply_wallpaper_path(&path)
}

fn apply_wallpaper_path(path: &std::path::Path) -> Result<(), String> {
    let mut wide_path: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    let result = unsafe { SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, wide_path.as_mut_ptr().cast(), SPIF_UPDATEINIFILE | SPIF_SENDCHANGE) };
    if result == 0 { Err(format!("Windows could not apply this wallpaper (error {}).", unsafe { windows_sys::Win32::Foundation::GetLastError() })) } else { Ok(()) }
}

#[tauri::command]
pub async fn wallpaper_save_as(app: tauri::AppHandle, id: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || save_wallpaper_as_blocking(app, id)).await
        .map_err(|error| format!("The Save as dialog worker stopped: {error}"))?
}

fn save_wallpaper_as_blocking(app: tauri::AppHandle, id: String) -> Result<Option<String>, String> {
    let filename = std::path::Path::new(&id).file_name().and_then(|value| value.to_str()).ok_or("Invalid wallpaper identifier")?;
    if filename != id || id.contains("..") { return Err("Invalid wallpaper identifier".into()); }
    let source = wallpaper_dir(&app)?.join(filename);
    if !source.is_file() { return Err("That wallpaper is no longer in UtilityX storage.".into()); }
    let mut file_name: Vec<u16> = filename.encode_utf16().chain([0]).collect();
    file_name.resize(32768, 0);
    let filter: Vec<u16> = "Image files\0*.jpg;*.jpeg;*.png;*.webp;*.bmp\0All files\0*.*\0\0".encode_utf16().collect();
    let title: Vec<u16> = "Save wallpaper as".encode_utf16().chain([0]).collect();
    let initial_dir = app.path().download_dir().ok();
    let initial_dir_wide = initial_dir.as_ref().map(|path| path.to_string_lossy().encode_utf16().chain([0]).collect::<Vec<_>>());
    let mut dialog: OPENFILENAMEW = unsafe { std::mem::zeroed() };
    dialog.lStructSize = std::mem::size_of::<OPENFILENAMEW>() as u32;
    dialog.lpstrFilter = filter.as_ptr();
    dialog.lpstrFile = file_name.as_mut_ptr();
    dialog.nMaxFile = file_name.len() as u32;
    dialog.lpstrTitle = title.as_ptr();
    dialog.lpstrInitialDir = initial_dir_wide.as_ref().map_or(std::ptr::null(), |path| path.as_ptr());
    dialog.Flags = OFN_EXPLORER | OFN_NOCHANGEDIR | OFN_OVERWRITEPROMPT | OFN_PATHMUSTEXIST;
    let chosen = unsafe { GetSaveFileNameW(&mut dialog) };
    if chosen == 0 {
        let error = unsafe { CommDlgExtendedError() };
        if error == 0 { return Ok(None); }
        return Err(format!("Windows could not show the Save As dialog (error {error:#x})."));
    }
    let length = file_name.iter().position(|unit| *unit == 0).unwrap_or(file_name.len());
    let destination = std::path::PathBuf::from(std::ffi::OsString::from_wide(&file_name[..length]));
    std::fs::copy(&source, &destination).map_err(|error| format!("Could not save wallpaper to the selected location: {error}"))?;
    Ok(Some(destination.to_string_lossy().into_owned()))
}

fn decode_base64(value: &str) -> Result<Vec<u8>, ()> {
    let mut output = Vec::with_capacity(value.len() * 3 / 4);
    let mut buffer = 0u32;
    let mut bits = 0;
    for byte in value.bytes() {
        let digit = match byte { b'A'..=b'Z' => byte - b'A', b'a'..=b'z' => byte - b'a' + 26, b'0'..=b'9' => byte - b'0' + 52, b'+' => 62, b'/' => 63, b'=' => break, _ => return Err(()) };
        buffer = (buffer << 6) | digit as u32;
        bits += 6;
        if bits >= 8 { bits -= 8; output.push((buffer >> bits) as u8); }
    }
    Ok(output)
}

fn encode_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let value = ((chunk[0] as u32) << 16) | ((chunk.get(1).copied().unwrap_or(0) as u32) << 8) | chunk.get(2).copied().unwrap_or(0) as u32;
        output.push(TABLE[((value >> 18) & 63) as usize] as char);
        output.push(TABLE[((value >> 12) & 63) as usize] as char);
        output.push(if chunk.len() > 1 { TABLE[((value >> 6) & 63) as usize] as char } else { '=' });
        output.push(if chunk.len() > 2 { TABLE[(value & 63) as usize] as char } else { '=' });
    }
    output
}
