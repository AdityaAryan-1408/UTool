#![windows_subsystem = "windows"]

mod shelf;
mod clipboard;
mod stats;
mod apps;
mod wallpaper;
mod wifi;
mod ai;
mod screen_capture;
mod link_preview;

use std::mem::zeroed;
use std::ffi::c_void;
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::{mem, ptr};
use std::sync::mpsc::{channel, Sender, SyncSender};
use std::sync::OnceLock;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{LogicalPosition, LogicalSize, Manager};
use windows_sys::Win32::Foundation::{HWND, RECT};
use windows_sys::Win32::Graphics::Gdi::{CombineRgn, CreateRectRgn, CreateRoundRectRgn, DeleteObject, GetMonitorInfoW, MonitorFromWindow, SetWindowRgn, MONITORINFO, MONITOR_DEFAULTTONEAREST, RGN_OR};
use windows_sys::Win32::System::Power::{GetSystemPowerStatus, SetThreadExecutionState, SYSTEM_POWER_STATUS};
use windows_sys::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
use windows_sys::Win32::System::Threading::{GetCurrentProcess, GetCurrentProcessId};
use windows_sys::Win32::UI::Shell::ShellExecuteW;
use windows_sys::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId, IsIconic, SW_SHOWNORMAL};

#[link(name = "user32")]
extern "system" {
    fn LockWorkStation() -> i32;
    fn RegisterHotKey(
        hWnd: *mut std::ffi::c_void,
        id: i32,
        fsModifiers: u32,
        vk: u32,
    ) -> i32;
    fn GetMessageW(
        lpMsg: *mut windows_sys::Win32::UI::WindowsAndMessaging::MSG,
        hWnd: *mut std::ffi::c_void,
        wMsgFilterMin: u32,
        wMsgFilterMax: u32,
    ) -> i32;
    fn keybd_event(bVk: u8, bScan: u8, dwFlags: u32, dwExtraInfo: usize);
}

#[link(name = "PowrProf")]
extern "system" {
    fn SetSuspendState(hibernate: u8, force: u8, disable_wake_events: u8) -> u8;
}

const ES_CONTINUOUS: u32 = 0x80000000;
const ES_SYSTEM_REQUIRED: u32 = 0x00000001;
const ES_DISPLAY_REQUIRED: u32 = 0x00000002;
const KEYEVENTF_KEYUP: u32 = 0x0002;
const VK_VOLUME_UP: u8 = 0xAF;
const VK_VOLUME_DOWN: u8 = 0xAE;
const VK_VOLUME_MUTE: u8 = 0xAD;
const MOD_NOREPEAT: u32 = 0x4000;

static AUTO_HIDE_FULLSCREEN: AtomicBool = AtomicBool::new(false);
static USER_WANTS_NOTCH_VISIBLE: AtomicBool = AtomicBool::new(true);
static AUTO_HIDDEN_FOR_FULLSCREEN: AtomicBool = AtomicBool::new(false);
static FULLSCREEN_VISIBILITY_OVERRIDE: AtomicBool = AtomicBool::new(false);
static FULLSCREEN_APP_ACTIVE: AtomicBool = AtomicBool::new(false);
#[repr(C)]
#[derive(Clone, Copy)]
struct Guid { data1: u32, data2: u16, data3: u16, data4: [u8; 8] }

const CLSID_MM_DEVICE_ENUMERATOR: Guid = Guid { data1: 0xBCDE0395, data2: 0xE52F, data3: 0x467C, data4: [0x8E, 0x3D, 0xC4, 0x57, 0x92, 0x91, 0x69, 0x2E] };
const IID_IMM_DEVICE_ENUMERATOR: Guid = Guid { data1: 0xA95664D2, data2: 0x9614, data3: 0x4F35, data4: [0xA7, 0x46, 0xDE, 0x8D, 0xB6, 0x36, 0x17, 0xE6] };
const IID_IAUDIO_ENDPOINT_VOLUME: Guid = Guid { data1: 0x5CDF2C82, data2: 0x841E, data3: 0x4546, data4: [0x97, 0x22, 0x0C, 0xF7, 0x40, 0x78, 0x22, 0x9A] };

#[link(name = "ole32")]
extern "system" {
    fn CoInitializeEx(reserved: *mut c_void, coinit: u32) -> i32;
    fn CoUninitialize();
    fn CoCreateInstance(clsid: *const Guid, outer: *mut c_void, context: u32, iid: *const Guid, object: *mut *mut c_void) -> i32;
}

unsafe fn com_method<T: Copy>(object: *mut c_void, index: usize) -> T {
    let vtable = *(object as *mut *mut *const c_void);
    mem::transmute_copy(&*vtable.add(index))
}

unsafe fn release_com(object: *mut c_void) {
    if !object.is_null() {
        let release: unsafe extern "system" fn(*mut c_void) -> u32 = com_method(object, 2);
        release(object);
    }
}

fn with_audio_endpoint<T>(flow: i32, action: impl FnOnce(*mut c_void) -> Result<T, String>) -> Result<T, String> {
    unsafe {
        let init_result = CoInitializeEx(ptr::null_mut(), 0);
        let uninitialize = init_result >= 0;
        if init_result < 0 && init_result != 0x80010106u32 as i32 {
            return Err(format!("Could not initialize Windows audio: HRESULT {init_result:#010x}"));
        }

        let result = (|| {
            let mut enumerator = ptr::null_mut();
            let mut device = ptr::null_mut();
            let mut endpoint = ptr::null_mut();
            let outcome = (|| {
                let hr = CoCreateInstance(&CLSID_MM_DEVICE_ENUMERATOR, ptr::null_mut(), 0x17, &IID_IMM_DEVICE_ENUMERATOR, &mut enumerator);
                if hr < 0 { return Err(format!("Could not open the Windows audio device list (HRESULT {hr:#010x}).")); }

                let get_default: unsafe extern "system" fn(*mut c_void, i32, i32, *mut *mut c_void) -> i32 = com_method(enumerator, 4);
                let hr = get_default(enumerator, flow, 0, &mut device);
                if hr < 0 { return Err(format!("No default {} audio device is available (HRESULT {hr:#010x}).", if flow == 0 { "output" } else { "input" })); }

                let activate: unsafe extern "system" fn(*mut c_void, *const Guid, u32, *mut c_void, *mut *mut c_void) -> i32 = com_method(device, 3);
                let hr = activate(device, &IID_IAUDIO_ENDPOINT_VOLUME, 0x17, ptr::null_mut(), &mut endpoint);
                if hr < 0 { return Err(format!("Could not access the default audio endpoint (HRESULT {hr:#010x}).")); }
                action(endpoint)
            })();
            release_com(endpoint);
            release_com(device);
            release_com(enumerator);
            outcome
        })();

        if uninitialize { CoUninitialize(); }
        result
    }
}

fn audio_get_volume(endpoint: *mut c_void) -> Result<u8, String> {
    unsafe {
        let get: unsafe extern "system" fn(*mut c_void, *mut f32) -> i32 = com_method(endpoint, 9);
        let mut level = 0.0f32;
        let hr = get(endpoint, &mut level);
        if hr < 0 { return Err(format!("Could not read Windows volume (HRESULT {hr:#010x}).")); }
        Ok((level.clamp(0.0, 1.0) * 100.0).round() as u8)
    }
}

fn audio_set_volume(endpoint: *mut c_void, level: u8) -> Result<(), String> {
    unsafe {
        let set: unsafe extern "system" fn(*mut c_void, f32, *const Guid) -> i32 = com_method(endpoint, 7);
        let context = Guid { data1: 0, data2: 0, data3: 0, data4: [0; 8] };
        let hr = set(endpoint, level.min(100) as f32 / 100.0, &context);
        if hr < 0 { return Err(format!("Could not set Windows volume (HRESULT {hr:#010x}).")); }
        Ok(())
    }
}

fn audio_get_mute(endpoint: *mut c_void) -> Result<bool, String> {
    unsafe {
        let get: unsafe extern "system" fn(*mut c_void, *mut i32) -> i32 = com_method(endpoint, 15);
        let mut muted = 0;
        let hr = get(endpoint, &mut muted);
        if hr < 0 { return Err(format!("Could not read Windows mute state (HRESULT {hr:#010x}).")); }
        Ok(muted != 0)
    }
}

fn audio_set_mute(endpoint: *mut c_void, muted: bool) -> Result<bool, String> {
    unsafe {
        let set: unsafe extern "system" fn(*mut c_void, i32, *const Guid) -> i32 = com_method(endpoint, 14);
        let get: unsafe extern "system" fn(*mut c_void, *mut i32) -> i32 = com_method(endpoint, 15);
        let context = Guid { data1: 0, data2: 0, data3: 0, data4: [0; 8] };
        let hr = set(endpoint, i32::from(muted), &context);
        if hr < 0 { return Err(format!("Could not change Windows mute state (HRESULT {hr:#010x}).")); }
        let mut actual = 0;
        let hr = get(endpoint, &mut actual);
        if hr < 0 { return Err(format!("Could not confirm Windows mute state (HRESULT {hr:#010x}).")); }
        Ok(actual != 0)
    }
}

static KEEP_AWAKE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static KEEP_AWAKE_REQUESTS: OnceLock<Sender<(bool, SyncSender<Result<(), String>>)>> = OnceLock::new();

const MOD_ALT: u32 = 0x0001;
const MOD_CONTROL: u32 = 0x0002;
const MOD_SHIFT: u32 = 0x0004;
const WM_HOTKEY: u32 = 0x0312;

#[derive(Clone, Copy)]
struct NotchRegionMetrics {
    width: f64,
    height: f64,
    radius: f64,
}

static REGION_ANIMATION_ID: AtomicU64 = AtomicU64::new(0);
static REGION_ANIMATION_FRAME: Mutex<()> = Mutex::new(());
static CURRENT_NOTCH_REGION: Mutex<NotchRegionMetrics> = Mutex::new(NotchRegionMetrics {
    width: 270.0,
    height: 38.0,
    radius: 16.0,
});

#[derive(serde::Serialize)]
struct SystemTelemetry {
    cpu_percent: f32,
    ram_mb: f64,
    battery_percent: u8,
    is_plugged: bool,
}

#[tauri::command]
fn get_telemetry() -> SystemTelemetry {
    let mut ram_mb = 0.0;
    unsafe {
        let mut pmc: PROCESS_MEMORY_COUNTERS = zeroed();
        pmc.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
        if GetProcessMemoryInfo(
            GetCurrentProcess(),
            &mut pmc,
            std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
        ) != 0
        {
            ram_mb = pmc.WorkingSetSize as f64 / (1024.0 * 1024.0);
        }
    }

    let mut battery_percent = 0;
    let mut is_plugged = false;
    unsafe {
        let mut sps: SYSTEM_POWER_STATUS = zeroed();
        if GetSystemPowerStatus(&mut sps) != 0 {
            if sps.BatteryLifePercent <= 100 {
                battery_percent = sps.BatteryLifePercent;
            }
            is_plugged = sps.ACLineStatus == 1;
        }
    }

    SystemTelemetry {
        cpu_percent: stats::current_cpu_percent() as f32,
        ram_mb: (ram_mb * 10.0).round() / 10.0,
        battery_percent,
        is_plugged,
    }
}

fn get_screen_logical_bounds(window: &tauri::WebviewWindow) -> (f64, f64, f64, f64) {
    if let Ok(Some(monitor)) = window.primary_monitor() {
        let sf = monitor.scale_factor();
        let position = monitor.position();
        let size = monitor.size();
        (
            position.x as f64 / sf,
            position.y as f64 / sf,
            size.width as f64 / sf,
            size.height as f64 / sf,
        )
    } else {
        (0.0, 0.0, 1536.0, 864.0)
    }
}

#[tauri::command]
fn lock_pc() -> bool {
    unsafe { LockWorkStation() != 0 }
}

#[tauri::command]
fn request_system_power(action: String) -> Result<(), String> {
    match action.as_str() {
        "sleep" => {
            let result = unsafe { SetSuspendState(0, 0, 0) };
            if result == 0 {
                Err(format!("Windows could not put the PC to sleep (error {}).", unsafe { windows_sys::Win32::Foundation::GetLastError() }))
            } else {
                Ok(())
            }
        }
        "restart" | "shutdown" => {
            let args = if action == "restart" { ["/r", "/t", "0"] } else { ["/s", "/t", "0"] };
            Command::new("shutdown.exe")
                .creation_flags(0x08000000)
                .args(args)
                .spawn()
                .map(|_| ())
                .map_err(|error| format!("Windows could not start the {action} request: {error}"))
        }
        _ => Err("Unsupported power action.".into()),
    }
}

#[tauri::command]
fn quit_utilityx(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn set_keep_awake(enabled: bool) -> Result<bool, String> {
    let sender = KEEP_AWAKE_REQUESTS.get_or_init(|| {
        let (tx, rx) = channel::<(bool, SyncSender<Result<(), String>>)>() ;
        std::thread::spawn(move || {
            while let Ok((requested, reply)) = rx.recv() {
                let flags = if requested {
                    ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED
                } else {
                    ES_CONTINUOUS
                };
                let result = unsafe { SetThreadExecutionState(flags) };
                if result == 0 {
                    let _ = reply.send(Err("Windows could not update the sleep/display request.".into()));
                } else {
                    KEEP_AWAKE.store(requested, Ordering::Release);
                    let _ = reply.send(Ok(()));
                }
            }
        });
        tx
    });
    let (reply, result) = std::sync::mpsc::sync_channel(1);
    sender.send((enabled, reply)).map_err(|_| "Keep-Awake worker is unavailable.".to_string())?;
    result.recv().map_err(|_| "Keep-Awake worker stopped unexpectedly.".to_string())??;
    Ok(enabled)
}

#[tauri::command]
fn adjust_system_volume(delta: i32) -> Result<(), String> {
    if delta == 0 { return Ok(()); }
    if !(-100..=100).contains(&delta) { return Err("Volume adjustment is outside the supported range.".into()); }
    let key = if delta > 0 { VK_VOLUME_UP } else { VK_VOLUME_DOWN };
    for _ in 0..delta.abs() {
        unsafe {
            keybd_event(key, 0, 0, 0);
            keybd_event(key, 0, KEYEVENTF_KEYUP, 0);
        }
    }
    Ok(())
}

#[tauri::command]
fn open_windows_settings(page: String) -> Result<(), String> {
    let route = match page.as_str() {
        "display" => "ms-settings:display",
        "sound" => "ms-settings:sound",
        "wifi" | "network" => "ms-settings:network-wifi",
        "bluetooth" => "ms-settings:bluetooth",
        "hotspot" => "ms-settings:network-mobilehotspot",
        "nightlight" => "ms-settings:nightlight",
        "notifications" => "ms-settings:notifications",
        _ => return Err("Unsupported Windows Settings page.".into()),
    };
    let operation: Vec<u16> = "open".encode_utf16().chain(Some(0)).collect();
    let target: Vec<u16> = route.encode_utf16().chain(Some(0)).collect();
    let result = unsafe {
        ShellExecuteW(ptr::null_mut(), operation.as_ptr(), target.as_ptr(), ptr::null(), ptr::null(), SW_SHOWNORMAL)
    };
    if (result as isize) <= 32 {
        return Err("Windows could not open the requested Settings page.".into());
    }
    Ok(())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) || url.chars().any(char::is_control) {
        return Err("Only web links can be opened outside Ollumi.".into());
    }
    let operation: Vec<u16> = "open".encode_utf16().chain(Some(0)).collect();
    let target: Vec<u16> = url.encode_utf16().chain(Some(0)).collect();
    let result = unsafe { ShellExecuteW(ptr::null_mut(), operation.as_ptr(), target.as_ptr(), ptr::null(), ptr::null(), SW_SHOWNORMAL) };
    if (result as isize) <= 32 { return Err("Windows could not open that link.".into()); }
    Ok(())
}

#[tauri::command]
fn toggle_system_mute() {
    unsafe {
        keybd_event(VK_VOLUME_MUTE, 0, 0, 0);
        keybd_event(VK_VOLUME_MUTE, 0, KEYEVENTF_KEYUP, 0);
    }
}

fn run_powershell(script: &str) -> Result<String, String> {
    let output = Command::new("powershell.exe")
        .creation_flags(0x08000000)
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script])
        .output()
        .map_err(|error| format!("Could not start Windows control helper: {error}"))?;
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if message.is_empty() { "Windows rejected the control request.".into() } else { message });
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[derive(serde::Serialize)]
struct AudioControlState { volume: u8, muted: bool, microphone_muted: bool, microphone_available: bool }

#[tauri::command]
fn get_audio_control_state() -> Result<AudioControlState, String> {
    let volume = with_audio_endpoint(0, audio_get_volume)?;
    let muted = with_audio_endpoint(0, audio_get_mute)?;
    let microphone = with_audio_endpoint(1, audio_get_mute);
    let microphone_available = microphone.is_ok();
    let microphone_muted = microphone.unwrap_or(false);
    Ok(AudioControlState {
        volume,
        muted,
        microphone_muted,
        microphone_available,
    })
}

#[tauri::command]
fn set_master_volume(value: u8) -> Result<u8, String> {
    with_audio_endpoint(0, |endpoint| { audio_set_volume(endpoint, value)?; audio_get_volume(endpoint) })
}

#[tauri::command]
fn set_audio_muted(muted: bool) -> Result<bool, String> {
    with_audio_endpoint(0, |endpoint| audio_set_mute(endpoint, muted))
}

#[tauri::command]
fn set_microphone_muted(muted: bool) -> Result<bool, String> {
    with_audio_endpoint(1, |endpoint| audio_set_mute(endpoint, muted))
}

#[tauri::command]
fn get_display_brightness() -> Result<u8, String> {
    let output = run_powershell("$ErrorActionPreference='Stop'; (Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness | Select-Object -First 1 -ExpandProperty CurrentBrightness)")?;
    output.parse::<u8>().map_err(|_| "This display does not expose adjustable brightness through Windows.".into())
}

#[tauri::command]
fn set_display_brightness(value: u8) -> Result<u8, String> {
    let level = value.min(100);
    let script = format!("$ErrorActionPreference='Stop'; $m=Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Select-Object -First 1; if ($null -eq $m) {{ throw 'This display does not expose adjustable brightness through Windows.' }}; $r=Invoke-CimMethod -InputObject $m -MethodName WmiSetBrightness -Arguments @{{ Timeout=1; Brightness={level} }}; if ($null -ne $r.ReturnValue -and [int]$r.ReturnValue -ne 0) {{ throw ('Windows brightness request returned status ' + [int]$r.ReturnValue) }}; Start-Sleep -Milliseconds 180; (Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness | Select-Object -First 1 -ExpandProperty CurrentBrightness)");
    run_powershell(&script)?
        .parse::<u8>()
        .map_err(|_| "Windows did not confirm the brightness change.".into())
}

fn apply_notch_region(window: &tauri::WebviewWindow, width: f64, height: f64, bottom_radius: f64) {
    let Ok(hwnd) = window.hwnd() else { return; };
    let scale = window.scale_factor().unwrap_or(1.0);
    let window_width = window.inner_size().map(|size| size.width as i32).unwrap_or(1920);
    let width = (width * scale).round().max(1.0) as i32;
    let height = (height * scale).round().max(1.0) as i32;
    let radius = (bottom_radius * scale).round().max(1.0) as i32;
    let left = (window_width - width) / 2;
    let right = left + width;
    let corner = (radius * 2).min(height);

    unsafe {
        // A round rectangle supplies the lower corners; the top strip fills its
        // upper corners so the notch remains flush with the screen edge.
        let rounded = CreateRoundRectRgn(left, 0, right, height + 1, radius * 2, radius * 2);
        let top = CreateRectRgn(left, 0, right, corner);
        let region = CreateRectRgn(0, 0, 0, 0);
        if rounded.is_null() || top.is_null() || region.is_null() {
            if !rounded.is_null() { DeleteObject(rounded as _); }
            if !top.is_null() { DeleteObject(top as _); }
            if !region.is_null() { DeleteObject(region as _); }
            return;
        }
        CombineRgn(region, rounded, top, RGN_OR);
        DeleteObject(rounded as _);
        DeleteObject(top as _);
        if SetWindowRgn(hwnd.0, region, 0) == 0 {
            DeleteObject(region as _);
        }
    }
}

fn cubic_coordinate(t: f64, first: f64, second: f64) -> f64 {
    let inverse = 1.0 - t;
    3.0 * inverse * inverse * t * first
        + 3.0 * inverse * t * t * second
        + t * t * t
}

fn notch_ease(progress: f64) -> f64 {
    let mut low = 0.0;
    let mut high = 1.0;
    for _ in 0..12 {
        let middle = (low + high) * 0.5;
        if cubic_coordinate(middle, 0.22, 0.36) < progress {
            low = middle;
        } else {
            high = middle;
        }
    }
    cubic_coordinate((low + high) * 0.5, 1.0, 1.0)
}

#[tauri::command]
fn update_notch_stage(window: tauri::WebviewWindow, stage: String, width: f64, height: f64) {
    let target = NotchRegionMetrics {
        width: width.clamp(80.0, 1600.0),
        height: height.clamp(32.0, 1000.0),
        radius: match stage.as_str() {
            "full" => 28.0,
            "hovered" => 20.0,
            _ => 16.0,
        },
    };

    let start = CURRENT_NOTCH_REGION
        .lock()
        .map(|current| *current)
        .unwrap_or(NotchRegionMetrics { width: 270.0, height: 38.0, radius: 16.0 });
    if (start.width - target.width).abs() < 0.5
        && (start.height - target.height).abs() < 0.5
        && (start.radius - target.radius).abs() < 0.5
    {
        return;
    }

    let animation_id = REGION_ANIMATION_ID.fetch_add(1, Ordering::AcqRel) + 1;
    std::thread::spawn(move || {
        const DURATION_SECONDS: f64 = 0.24;
        let started = Instant::now();
        loop {
            let Ok(_frame_guard) = REGION_ANIMATION_FRAME.lock() else { break; };
            if REGION_ANIMATION_ID.load(Ordering::Acquire) != animation_id {
                break;
            }

            let progress = (started.elapsed().as_secs_f64() / DURATION_SECONDS).clamp(0.0, 1.0);
            let eased = notch_ease(progress);
            let current = NotchRegionMetrics {
                width: start.width + (target.width - start.width) * eased,
                height: start.height + (target.height - start.height) * eased,
                radius: start.radius + (target.radius - start.radius) * eased,
            };
            if let Ok(mut region) = CURRENT_NOTCH_REGION.lock() {
                *region = current;
            }
            apply_notch_region(&window, current.width, current.height, current.radius);

            if progress >= 1.0 {
                break;
            }
            drop(_frame_guard);
            std::thread::sleep(Duration::from_millis(16));
        }
    });
}

#[tauri::command]
fn toggle_notch_visibility(window: tauri::WebviewWindow) -> bool {
    toggle_utilityx_visibility(&window)
}

fn show_utilityx_window(window: &tauri::WebviewWindow) {
    USER_WANTS_NOTCH_VISIBLE.store(true, Ordering::Release);
    let fullscreen = FULLSCREEN_APP_ACTIVE.load(Ordering::Acquire);
    let override_autohide = fullscreen && AUTO_HIDE_FULLSCREEN.load(Ordering::Acquire);
    FULLSCREEN_VISIBILITY_OVERRIDE.store(override_autohide, Ordering::Release);
    AUTO_HIDDEN_FOR_FULLSCREEN.store(false, Ordering::Release);
    let _ = window.show();
    let _ = window.set_skip_taskbar(true);
}

fn toggle_utilityx_visibility(window: &tauri::WebviewWindow) -> bool {
    let fullscreen = FULLSCREEN_APP_ACTIVE.load(Ordering::Acquire)
        && AUTO_HIDE_FULLSCREEN.load(Ordering::Acquire);

    if fullscreen && AUTO_HIDDEN_FOR_FULLSCREEN.load(Ordering::Acquire) {
        // Let the user temporarily reveal the notch over a full-screen app.
        FULLSCREEN_VISIBILITY_OVERRIDE.store(true, Ordering::Release);
        AUTO_HIDDEN_FOR_FULLSCREEN.store(false, Ordering::Release);
        show_utilityx_window(window);
        return true;
    }

    if fullscreen && FULLSCREEN_VISIBILITY_OVERRIDE.load(Ordering::Acquire) {
        FULLSCREEN_VISIBILITY_OVERRIDE.store(false, Ordering::Release);
        USER_WANTS_NOTCH_VISIBLE.store(false, Ordering::Release);
        let _ = window.hide();
        return false;
    }

    let show = !USER_WANTS_NOTCH_VISIBLE.load(Ordering::Acquire);
    if show {
        show_utilityx_window(window);
    } else {
        USER_WANTS_NOTCH_VISIBLE.store(false, Ordering::Release);
        FULLSCREEN_VISIBILITY_OVERRIDE.store(false, Ordering::Release);
        let _ = window.hide();
    }
    show
}

fn is_fullscreen_on_notch_monitor(notch_hwnd: HWND) -> bool {
    unsafe {
        let foreground = GetForegroundWindow();
        if foreground.is_null() || foreground == notch_hwnd || IsIconic(foreground) != 0 {
            return false;
        }

        let mut foreground_pid = 0;
        GetWindowThreadProcessId(foreground, &mut foreground_pid);
        if foreground_pid == GetCurrentProcessId() {
            return false;
        }

        let mut class_name = [0u16; 128];
        let class_len = GetClassNameW(foreground, class_name.as_mut_ptr(), class_name.len() as i32);
        if class_len > 0 {
            let class_name = String::from_utf16_lossy(&class_name[..class_len as usize]);
            if matches!(class_name.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd") {
                return false;
            }
        }

        let notch_monitor = MonitorFromWindow(notch_hwnd, MONITOR_DEFAULTTONEAREST);
        let foreground_monitor = MonitorFromWindow(foreground, MONITOR_DEFAULTTONEAREST);
        if notch_monitor.is_null() || notch_monitor != foreground_monitor {
            return false;
        }

        let mut monitor_info: MONITORINFO = zeroed();
        monitor_info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        let mut window_rect: RECT = zeroed();
        if GetMonitorInfoW(notch_monitor, &mut monitor_info) == 0 || GetWindowRect(foreground, &mut window_rect) == 0 {
            return false;
        }

        let monitor_width = monitor_info.rcMonitor.right - monitor_info.rcMonitor.left;
        let monitor_height = monitor_info.rcMonitor.bottom - monitor_info.rcMonitor.top;
        if monitor_width <= 0 || monitor_height <= 0 {
            return false;
        }
        // A maximized app normally stops at the taskbar work area, while a
        // borderless or exclusive full-screen app covers almost the whole display.
        let tolerance_x = (monitor_width / 100).max(4);
        let tolerance_y = (monitor_height / 100).max(4);
        window_rect.left <= monitor_info.rcMonitor.left + tolerance_x
            && window_rect.top <= monitor_info.rcMonitor.top + tolerance_y
            && window_rect.right >= monitor_info.rcMonitor.right - tolerance_x
            && window_rect.bottom >= monitor_info.rcMonitor.bottom - tolerance_y
    }
}

fn start_fullscreen_autohide_watcher(window: tauri::WebviewWindow) {
    std::thread::spawn(move || loop {
        let fullscreen = window.hwnd()
            .map(|hwnd| is_fullscreen_on_notch_monitor(hwnd.0))
            .unwrap_or(false);
        FULLSCREEN_APP_ACTIVE.store(fullscreen, Ordering::Release);

        if fullscreen {
            if AUTO_HIDE_FULLSCREEN.load(Ordering::Acquire)
                && USER_WANTS_NOTCH_VISIBLE.load(Ordering::Acquire)
                && !FULLSCREEN_VISIBILITY_OVERRIDE.load(Ordering::Acquire)
                && window.is_visible().unwrap_or(false)
                && window.hide().is_ok()
            {
                AUTO_HIDDEN_FOR_FULLSCREEN.store(true, Ordering::Release);
            }
        } else {
            FULLSCREEN_VISIBILITY_OVERRIDE.store(false, Ordering::Release);
            if AUTO_HIDDEN_FOR_FULLSCREEN.swap(false, Ordering::AcqRel)
                && AUTO_HIDE_FULLSCREEN.load(Ordering::Acquire)
                && USER_WANTS_NOTCH_VISIBLE.load(Ordering::Acquire)
            {
                let _ = window.show();
                let _ = window.set_skip_taskbar(true);
            }
        }

        std::thread::sleep(Duration::from_millis(400));
    });
}

#[tauri::command]
fn set_fullscreen_autohide(window: tauri::WebviewWindow, enabled: bool) {
    AUTO_HIDE_FULLSCREEN.store(enabled, Ordering::Release);
    if !enabled {
        FULLSCREEN_VISIBILITY_OVERRIDE.store(false, Ordering::Release);
        if AUTO_HIDDEN_FOR_FULLSCREEN.swap(false, Ordering::AcqRel)
            && USER_WANTS_NOTCH_VISIBLE.load(Ordering::Acquire)
        {
            let _ = window.show();
            let _ = window.set_skip_taskbar(true);
        }
    }
}

#[tauri::command]
fn set_fullscreen_overlay(window: tauri::WebviewWindow, enabled: bool) {
    REGION_ANIMATION_ID.fetch_add(1, Ordering::AcqRel);
    if enabled {
        if let (Ok(hwnd), Ok(size)) = (window.hwnd(), window.inner_size()) {
            let region = unsafe { CreateRectRgn(0, 0, size.width as i32, size.height as i32) };
            if !region.is_null() {
                let result = unsafe { SetWindowRgn(hwnd.0, region, 1) };
                if result == 0 { unsafe { DeleteObject(region as _); } }
            }
        }
    } else if let Ok(current) = CURRENT_NOTCH_REGION.lock() {
        apply_notch_region(&window, current.width, current.height, current.radius);
    }
}

#[tauri::command]
fn show_main_window(window: tauri::WebviewWindow) {
    show_utilityx_window(&window);
}

#[tauri::command]
fn set_clipboard_focus_mode(window: tauri::WebviewWindow, enabled: bool) {
    let _ = window.set_focusable(!enabled);
    if !enabled { let _ = window.set_focus(); }
}

fn main() {
    std::panic::set_hook(Box::new(|panic| {
        let diagnostic_path = std::env::temp_dir().join("UtilityX-startup-error.txt");
        let details = format!("{panic}\n{}", std::backtrace::Backtrace::force_capture());
        let _ = std::fs::write(diagnostic_path, details);
    }));
    let arguments: Vec<String> = std::env::args().collect();
    if let Some(index) = arguments.iter().position(|argument| argument == "--utilityx-shelf-cleanup") {
        if let Some(path) = arguments.get(index + 1) {
            let _ = shelf::cleanup_expired_shelf_at_path(std::path::Path::new(path));
        } else {
            let _ = shelf::cleanup_expired_shelf_for_current_user();
        }
        return;
    }
    let app_result = tauri::Builder::default()
        .setup(|app| {
            clipboard::start_listener(app.handle().clone());
            wallpaper::start_cycle_scheduler(app.handle().clone());
            if let Some(window) = app.get_webview_window("main") {
                let (x, y, screen_w, screen_h) = get_screen_logical_bounds(&window);

                // Keep a stable transparent overlay across notch stages. Native
                // window resizing on hover caused reflow and compositor flashes.
                let _ = window.set_size(LogicalSize::new(screen_w, screen_h));
                let _ = window.set_position(LogicalPosition::new(x, y));
                let _ = window.set_always_on_top(true);
                let _ = window.set_skip_taskbar(true);
                apply_notch_region(&window, 270.0, 38.0, 16.0);
                start_fullscreen_autohide_watcher(window.clone());

                let drop_window = window.clone();
                let drop_app = app.handle().clone();
                window.on_window_event(move |event| {
                    match event {
                        tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Enter { .. }) => {
                            REGION_ANIMATION_ID.fetch_add(1, Ordering::AcqRel);
                            if let Ok(mut region) = CURRENT_NOTCH_REGION.lock() {
                                *region = NotchRegionMetrics { width: 840.0, height: 430.0, radius: 28.0 };
                            }
                            apply_notch_region(&drop_window, 840.0, 430.0, 28.0);
                            let _ = drop_window.eval("window.dispatchEvent(new Event('ollumi-shelf-drag-enter'))");
                        }
                        tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) => {
                            match shelf::import_external_paths_with_ids(&drop_app, paths) {
                                Ok(ids) => {
                                    let detail = serde_json::json!({ "count": ids.len(), "ids": ids });
                                    let detail = serde_json::to_string(&detail).unwrap_or_else(|_| "{}".into());
                                    let js = format!("window.dispatchEvent(new CustomEvent('ollumi-shelf-files-dropped', {{ detail: {detail} }}))");
                                    let _ = drop_window.eval(&js);
                                }
                                Err(error) => {
                                    let message = serde_json::to_string(&error).unwrap_or_else(|_| "'Could not import dropped files'".into());
                                    let _ = drop_window.eval(&format!("window.dispatchEvent(new CustomEvent('ollumi-shelf-drop-error', {{ detail: {message} }}))"));
                                }
                            }
                        }
                        _ => {}
                    }
                });

                println!("Ollumi native desktop companion started (full-screen transparent WebView)");

                // Register only shortcuts shown in Settings and suppress key-repeat storms.
                let window_hotkey = window.clone();
                let hotkey_app = app.handle().clone();
                std::thread::spawn(move || {
                    unsafe {
                        RegisterHotKey(std::ptr::null_mut(), 102, MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT, 0x48);
                        RegisterHotKey(std::ptr::null_mut(), 103, MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT, 0x56);
                        RegisterHotKey(std::ptr::null_mut(), 104, MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT, 0x53);
                        RegisterHotKey(std::ptr::null_mut(), 105, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, 0x58);

                        let mut msg: windows_sys::Win32::UI::WindowsAndMessaging::MSG = zeroed();
                        while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
                            if msg.message == WM_HOTKEY {
                                if msg.wParam == 103 {
                                    let _ = clipboard::batch_paste(&hotkey_app);
                                    continue;
                                }
                                if msg.wParam == 104 {
                                    if !window_hotkey.is_visible().unwrap_or(false) {
                                        show_utilityx_window(&window_hotkey);
                                    }
                                    let _ = window_hotkey.eval("window.dispatchEvent(new Event('ollumi-circle-search'))");
                                    continue;
                                }
                                if msg.wParam == 105 {
                                    if !window_hotkey.is_visible().unwrap_or(false) {
                                        show_utilityx_window(&window_hotkey);
                                    }
                                    let _ = window_hotkey.eval("window.dispatchEvent(new Event('ollumi-screen-capture'))");
                                    continue;
                                }
                                if msg.wParam == 102 {
                                    toggle_utilityx_visibility(&window_hotkey);
                                    continue;
                                }
                            }
                        }
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            apps::apps_list_installed,
            apps::apps_refresh_installed,
            apps::apps_launch_app,
            wallpaper::wallpaper_list_local,
            wallpaper::wallpaper_import_local,
            wallpaper::wallpaper_delete_local,
            wallpaper::wallpaper_set_local,
            wallpaper::wallpaper_get_cycle_settings,
            wallpaper::wallpaper_set_cycle_settings,
            wallpaper::wallpaper_save_as,
            wallpaper::wallpaper_fetch_online,
            wallpaper::wallpaper_save_online,
            get_telemetry,
            stats::get_system_stats,
            stats::test_network_latency,
            stats::test_download_speed,
            stats::test_upload_speed,
            lock_pc,
            request_system_power,
            quit_utilityx,
            set_keep_awake,
            adjust_system_volume,
            toggle_system_mute,
            get_display_brightness,
            set_display_brightness,
            get_audio_control_state,
            set_master_volume,
            set_audio_muted,
            set_microphone_muted,
            open_windows_settings,
            wifi::wifi_get_status,
            wifi::wifi_scan_networks,
            wifi::wifi_connect_network,
            wifi::wifi_disconnect,
            ai::ai_key_status,
            ai::ai_save_key,
            ai::ai_delete_key,
            ai::ai_test_key,
            ai::ai_circle_search,
            screen_capture::capture_screen,
            open_external_url,
            update_notch_stage,
            toggle_notch_visibility,
            set_fullscreen_autohide,
            set_fullscreen_overlay,
            show_main_window,
            set_clipboard_focus_mode,
            clipboard::clipboard_list_items,
            clipboard::clipboard_read_item,
            clipboard::clipboard_image_preview,
            clipboard::clipboard_copy_item,
            clipboard::clipboard_delete_item,
            clipboard::clipboard_clear,
            clipboard::clipboard_capture_status,
            clipboard::clipboard_set_capture_enabled,
            shelf::shelf_list_files,
            shelf::shelf_read_file,
            shelf::shelf_store_file,
            shelf::shelf_delete_file,
            shelf::shelf_clear_files,
            shelf::shelf_open_file,
            shelf::shelf_reveal_file,
            shelf::shelf_get_location,
            shelf::shelf_open_location,
            shelf::shelf_save_file_as,
            shelf::shelf_copy_file,
            shelf::shelf_import_clipboard_files,
            link_preview::get_link_preview
        ])
        .build(tauri::generate_context!());
    let app = match app_result {
        Ok(app) => app,
        Err(error) => {
            let diagnostic_path = std::env::temp_dir().join("UtilityX-startup-error.txt");
            let _ = std::fs::write(&diagnostic_path, format!("{error:?}"));
            std::process::exit(101);
        }
    };
    app.run(|_app_handle, event| {
            println!("Tauri Event: {:?}", event);
            if let tauri::RunEvent::ExitRequested { code, api, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}
