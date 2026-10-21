use serde::Serialize;
use std::collections::HashMap;
use std::ffi::OsString;
use std::mem::zeroed;
use std::net::{SocketAddr, TcpStream};
use std::os::windows::ffi::OsStringExt;
use std::path::Path;
use std::ptr::null_mut;
use std::sync::Mutex;
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, FILETIME};
use windows_sys::Win32::NetworkManagement::IpHelper::{FreeMibTable, GetBestInterface, GetIfTable2, MIB_IF_ROW2, MIB_IF_TABLE2};
use windows_sys::Win32::Networking::WinHttp::{WinHttpAddRequestHeaders, WinHttpCloseHandle, WinHttpConnect, WinHttpOpen, WinHttpOpenRequest, WinHttpQueryDataAvailable, WinHttpQueryHeaders, WinHttpReadData, WinHttpReceiveResponse, WinHttpSendRequest, WinHttpSetTimeouts, WinHttpWriteData, WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_ADDREQ_FLAG_ADD, WINHTTP_FLAG_SECURE, WINHTTP_QUERY_FLAG_NUMBER, WINHTTP_QUERY_STATUS_CODE};
use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
use windows_sys::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
use windows_sys::Win32::System::ProcessStatus::{EnumProcesses, GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
use windows_sys::Win32::System::Performance::{PdhAddEnglishCounterW, PdhCollectQueryData, PdhGetFormattedCounterArrayW, PdhOpenQueryW, PDH_FMT_COUNTERVALUE_ITEM_W, PDH_FMT_DOUBLE, PDH_MORE_DATA};
use windows_sys::Win32::System::SystemInformation::{GetTickCount64, GetWindowsDirectoryW, GlobalMemoryStatusEx, MEMORYSTATUSEX};
use windows_sys::Win32::System::Threading::{GetProcessTimes, GetSystemTimes, OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessStat {
    name: String,
    memory_bytes: u64,
    cpu_percent: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    cpu_percent: f64,
    memory_used_bytes: u64,
    memory_total_bytes: u64,
    memory_percent: f64,
    gpu_percent: Option<f64>,
    disk_name: String,
    disk_used_bytes: u64,
    disk_total_bytes: u64,
    network_download_bps: u64,
    network_upload_bps: u64,
    network_connection_name: String,
    battery_percent: Option<u8>,
    battery_seconds_remaining: Option<u64>,
    is_plugged: bool,
    uptime_seconds: u64,
    process_count: usize,
    processes: Vec<ProcessStat>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkTest {
    latency_ms: f64,
    jitter_ms: f64,
}

const SPEED_TEST_SECONDS: u64 = 30;
const SPEED_TEST_HOST: &str = "speed.cloudflare.com";

struct SpeedTestSession {
    session: *mut std::ffi::c_void,
    connection: *mut std::ffi::c_void,
}

impl SpeedTestSession {
    fn open() -> Result<Self, String> {
        let agent: Vec<u16> = "UtilityX Network Speed Test".encode_utf16().chain(Some(0)).collect();
        let host: Vec<u16> = SPEED_TEST_HOST.encode_utf16().chain(Some(0)).collect();
        unsafe {
            let session = WinHttpOpen(agent.as_ptr(), WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, null_mut(), null_mut(), 0);
            if session.is_null() { return Err(winhttp_error("Could not initialize Windows network access")); }
            WinHttpSetTimeouts(session, 5000, 10000, 10000, 10000);
            let connection = WinHttpConnect(session, host.as_ptr(), 443, 0);
            if connection.is_null() {
                let error = winhttp_error("Could not connect to the speed test server");
                WinHttpCloseHandle(session);
                return Err(error);
            }
            Ok(Self { session, connection })
        }
    }

    fn open_request(&self, method: &str, path: &str) -> Result<*mut std::ffi::c_void, String> {
        let method: Vec<u16> = method.encode_utf16().chain(Some(0)).collect();
        let path: Vec<u16> = path.encode_utf16().chain(Some(0)).collect();
        let version: Vec<u16> = "HTTP/1.1".encode_utf16().chain(Some(0)).collect();
        let request = unsafe { WinHttpOpenRequest(self.connection, method.as_ptr(), path.as_ptr(), version.as_ptr(), null_mut(), null_mut(), WINHTTP_FLAG_SECURE) };
        if request.is_null() { Err(winhttp_error("Could not open a speed test request")) } else { Ok(request) }
    }
}

impl Drop for SpeedTestSession {
    fn drop(&mut self) {
        unsafe {
            if !self.connection.is_null() { WinHttpCloseHandle(self.connection); }
            if !self.session.is_null() { WinHttpCloseHandle(self.session); }
        }
    }
}

fn winhttp_error(context: &str) -> String {
    format!("{context} (Windows network error {}).", unsafe { GetLastError() })
}

unsafe fn read_response_status(request: *mut std::ffi::c_void) -> Result<(), String> {
    if WinHttpReceiveResponse(request, null_mut()) == 0 {
        return Err(winhttp_error("The speed test server did not respond"));
    }
    let mut status = 0u32;
    let mut status_bytes = std::mem::size_of::<u32>() as u32;
    if WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, null_mut(), (&mut status as *mut u32).cast(), &mut status_bytes, null_mut()) == 0 {
        return Err(winhttp_error("Could not read the speed test server response"));
    }
    if !(200..300).contains(&status) { return Err(format!("The speed test server returned HTTP {status}.")); }
    Ok(())
}

#[tauri::command]
pub fn test_download_speed() -> Result<f64, String> {
    let session = SpeedTestSession::open()?;
    let started = Instant::now();
    let mut received_bytes = 0u64;
    let mut request_id = 0u64;
    let mut buffer = vec![0u8; 64 * 1024];
    while started.elapsed() < Duration::from_secs(SPEED_TEST_SECONDS) {
        request_id += 1;
        // Keep each response within common proxy limits, then repeat until the
        // requested 30-second sampling window ends.
        let path = format!("/__down?bytes=50000000&measId={request_id}");
        let request = session.open_request("GET", &path)?;
        let result = unsafe {
            let headers: Vec<u16> = "Accept-Encoding: identity\r\nCache-Control: no-cache\r\n".encode_utf16().chain(Some(0)).collect();
            if WinHttpSendRequest(request, headers.as_ptr(), u32::MAX, null_mut(), 0, 0, 0) == 0 {
                Err(winhttp_error("Could not start the download measurement"))
            } else if WinHttpReceiveResponse(request, null_mut()) == 0 {
                Err(winhttp_error("The download measurement did not receive a response"))
            } else {
                let mut status = 0u32;
                let mut status_bytes = std::mem::size_of::<u32>() as u32;
                if WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, null_mut(), (&mut status as *mut u32).cast(), &mut status_bytes, null_mut()) == 0 {
                    Err(winhttp_error("Could not read the download response"))
                } else if !(200..300).contains(&status) {
                    Err(format!("The download endpoint returned HTTP {status}."))
                } else {
                    let mut read_error = None;
                    loop {
                        let mut available = 0u32;
                        if WinHttpQueryDataAvailable(request, &mut available) == 0 {
                            read_error = Some(winhttp_error("The download measurement was interrupted"));
                            break;
                        }
                        if available == 0 { break; }
                        let mut read = 0u32;
                        let amount = available.min(buffer.len() as u32);
                        if WinHttpReadData(request, buffer.as_mut_ptr().cast(), amount, &mut read) == 0 {
                            read_error = Some(winhttp_error("Could not read downloaded test data"));
                            break;
                        }
                        if read == 0 { break; }
                        received_bytes = received_bytes.saturating_add(read as u64);
                        if started.elapsed() >= Duration::from_secs(SPEED_TEST_SECONDS) { break; }
                    }
                    match read_error { Some(error) => Err(error), None => Ok(()) }
                }
            }
        };
        unsafe { WinHttpCloseHandle(request); }
        result?;
    }
    let elapsed = started.elapsed().as_secs_f64();
    if received_bytes == 0 { return Err("The speed test server sent no download data.".into()); }
    Ok(received_bytes as f64 * 8.0 / elapsed / 1_000_000.0)
}

#[tauri::command]
pub fn test_upload_speed() -> Result<f64, String> {
    let session = SpeedTestSession::open()?;
    let mut bytes_sent = 0u64;
    let buffer = vec![0x5au8; 50_000_000];
    let started = Instant::now();
    let mut request_id = 0u64;
    while started.elapsed() < Duration::from_secs(SPEED_TEST_SECONDS) {
        request_id += 1;
        let request = session.open_request("POST", &format!("/__up?measId={request_id}"))?;
        let headers: Vec<u16> = "Content-Type: application/octet-stream\r\n".encode_utf16().chain(Some(0)).collect();
        let mut request_bytes = 0usize;
        let mut request_result = unsafe {
            if WinHttpAddRequestHeaders(request, headers.as_ptr(), u32::MAX, WINHTTP_ADDREQ_FLAG_ADD) == 0 {
                Err(winhttp_error("Could not prepare the upload measurement"))
            } else if WinHttpSendRequest(request, null_mut(), 0, null_mut(), 0, buffer.len() as u32, 0) == 0 {
                Err(winhttp_error("Could not start the upload measurement"))
            } else {
                let mut error = None;
                while request_bytes < buffer.len() && started.elapsed() < Duration::from_secs(SPEED_TEST_SECONDS) {
                    let amount = (buffer.len() - request_bytes).min(64 * 1024) as u32;
                    let mut written = 0u32;
                    if WinHttpWriteData(request, buffer[request_bytes..].as_ptr().cast(), amount, &mut written) == 0 {
                        error = Some(winhttp_error("The upload measurement was interrupted"));
                        break;
                    }
                    request_bytes += written as usize;
                }
                match error { Some(error) => Err(error), None => Ok(()) }
            }
        };
        bytes_sent = bytes_sent.saturating_add(request_bytes as u64);
        let request_complete = request_bytes == buffer.len();
        if request_result.is_ok() && request_complete && started.elapsed() < Duration::from_secs(SPEED_TEST_SECONDS) {
            request_result = unsafe { read_response_status(request) };
        }
        unsafe { WinHttpCloseHandle(request); }
        request_result?;
    }
    let elapsed = started.elapsed().as_secs_f64();
    if bytes_sent == 0 { return Err("No upload data was sent.".into()); }
    Ok(bytes_sent as f64 * 8.0 / elapsed / 1_000_000.0)
}

#[derive(Default)]
struct CpuSample { total: u64, idle: u64 }
#[derive(Default)]
struct NetworkSample { received: u64, sent: u64, at: Option<Instant> }

static LAST_CPU: Mutex<Option<CpuSample>> = Mutex::new(None);
static LAST_NETWORK: Mutex<NetworkSample> = Mutex::new(NetworkSample { received: 0, sent: 0, at: None });
static LAST_PROCESS_TIMES: Mutex<Option<HashMap<u32, u64>>> = Mutex::new(None);
static GPU_COUNTER: OnceLock<Option<(isize, isize)>> = OnceLock::new();

fn sample_gpu() -> Option<f64> {
    let stored_handles = GPU_COUNTER.get_or_init(|| unsafe {
        let mut query = 0isize;
        if PdhOpenQueryW(std::ptr::null(), 0, &mut query) != 0 { return None; }
        let path: Vec<u16> = "\\GPU Engine(*)\\Utilization Percentage".encode_utf16().chain(Some(0)).collect();
        let mut counter = 0isize;
        if PdhAddEnglishCounterW(query, path.as_ptr(), 0, &mut counter) != 0 {
            windows_sys::Win32::System::Performance::PdhCloseQuery(query);
            return None;
        }
        Some((query, counter))
    });
    let Some(handles) = stored_handles.as_ref() else { return None; };
    unsafe {
        if PdhCollectQueryData(handles.0) != 0 { return None; }
        let mut required_bytes = 0u32;
        let mut item_count = 0u32;
        let result = PdhGetFormattedCounterArrayW(handles.1, PDH_FMT_DOUBLE, &mut required_bytes, &mut item_count, null_mut());
        if result != PDH_MORE_DATA || required_bytes == 0 { return None; }
        let item_size = std::mem::size_of::<PDH_FMT_COUNTERVALUE_ITEM_W>();
        let mut items = Vec::<PDH_FMT_COUNTERVALUE_ITEM_W>::with_capacity((required_bytes as usize + item_size - 1) / item_size);
        let result = PdhGetFormattedCounterArrayW(handles.1, PDH_FMT_DOUBLE, &mut required_bytes, &mut item_count, items.as_mut_ptr());
        if result != 0 || item_count == 0 { return None; }
        items.set_len(item_count as usize);
        let mut usage = 0.0f64;
        let mut found_3d = false;
        for item in &items {
            if item.FmtValue.CStatus > 1 || item.szName.is_null() { continue; }
            let mut length = 0usize;
            while *item.szName.add(length) != 0 { length += 1; }
            let instance = String::from_utf16_lossy(std::slice::from_raw_parts(item.szName, length));
            if instance.to_ascii_lowercase().contains("engtype_3d") {
                usage = usage.max(item.FmtValue.Anonymous.doubleValue);
                found_3d = true;
            }
        }
        if found_3d { Some(usage.clamp(0.0, 100.0)) } else { None }
    }
}

fn filetime_value(time: FILETIME) -> u64 {
    ((time.dwHighDateTime as u64) << 32) | time.dwLowDateTime as u64
}

fn sample_cpu() -> f64 {
    unsafe {
        let mut idle: FILETIME = zeroed();
        let mut kernel: FILETIME = zeroed();
        let mut user: FILETIME = zeroed();
        if GetSystemTimes(&mut idle, &mut kernel, &mut user) == 0 { return 0.0; }
        let sample = CpuSample {
            total: filetime_value(kernel).saturating_add(filetime_value(user)),
            idle: filetime_value(idle),
        };
        let Ok(mut previous) = LAST_CPU.lock() else { return 0.0; };
        let result = previous.as_ref().map(|last| {
            let total = sample.total.saturating_sub(last.total);
            let busy = total.saturating_sub(sample.idle.saturating_sub(last.idle));
            if total == 0 { 0.0 } else { (busy as f64 / total as f64 * 100.0).clamp(0.0, 100.0) }
        }).unwrap_or(0.0);
        *previous = Some(sample);
        result
    }
}

pub fn current_cpu_percent() -> f64 { sample_cpu() }

fn sample_memory() -> (u64, u64, f64) {
    unsafe {
        let mut status: MEMORYSTATUSEX = zeroed();
        status.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
        if GlobalMemoryStatusEx(&mut status) == 0 { return (0, 0, 0.0); }
        let used = status.ullTotalPhys.saturating_sub(status.ullAvailPhys);
        let percent = if status.ullTotalPhys == 0 { 0.0 } else { used as f64 / status.ullTotalPhys as f64 * 100.0 };
        (used, status.ullTotalPhys, percent)
    }
}

fn sample_disk() -> (String, u64, u64) {
    unsafe {
        let mut windows = [0u16; 512];
        let length = GetWindowsDirectoryW(windows.as_mut_ptr(), windows.len() as u32) as usize;
        if length == 0 || length >= windows.len() { return ("System drive".into(), 0, 0); }
        let windows_path = OsString::from_wide(&windows[..length]);
        let windows_path = windows_path.to_string_lossy();
        let drive = windows_path.chars().take(3).collect::<String>();
        let drive_wide: Vec<u16> = drive.encode_utf16().chain(Some(0)).collect();
        let mut available = 0u64;
        let mut total = 0u64;
        let mut free = 0u64;
        if GetDiskFreeSpaceExW(drive_wide.as_ptr(), &mut available, &mut total, &mut free) == 0 {
            return (drive, 0, 0);
        }
        (drive, total.saturating_sub(free), total)
    }
}

fn sample_network() -> (u64, u64, String) {
    unsafe {
        let mut table: *mut MIB_IF_TABLE2 = null_mut();
        if GetIfTable2(&mut table) != 0 || table.is_null() { return (0, 0, "No active connection".into()); }
        let count = (*table).NumEntries as usize;
        let first_row = std::ptr::addr_of!((*table).Table).cast::<MIB_IF_ROW2>();
        let mut received = 0u64;
        let mut sent = 0u64;
        let mut names = Vec::new();
        let mut default_interface = 0u32;
        let default_route_found = GetBestInterface(u32::from_ne_bytes([1, 1, 1, 1]), &mut default_interface) == 0;
        let mut default_name = None;
        for index in 0..count {
            let row = &*first_row.add(index);
            if row.OperStatus == 1 && row.Type != 24 {
                received = received.saturating_add(row.InOctets);
                sent = sent.saturating_add(row.OutOctets);
                let alias = String::from_utf16_lossy(&row.Alias);
                let alias = alias.trim_end_matches('\0').trim();
                if !alias.is_empty() && !names.iter().any(|name| name == alias) { names.push(alias.to_string()); }
                if default_route_found && row.InterfaceIndex == default_interface && !alias.is_empty() {
                    default_name = Some(alias.to_string());
                }
            }
        }
        FreeMibTable(table.cast());

        let now = Instant::now();
        let Ok(mut previous) = LAST_NETWORK.lock() else { return (0, 0, names.join(" + ")); };
        let rates = if let Some(at) = previous.at {
            let seconds = now.duration_since(at).as_secs_f64().max(0.001);
            (
                (received.saturating_sub(previous.received) as f64 / seconds) as u64,
                (sent.saturating_sub(previous.sent) as f64 / seconds) as u64,
            )
        } else { (0, 0) };
        previous.received = received;
        previous.sent = sent;
        previous.at = Some(now);
        let connection_name = default_name.or_else(|| names.first().cloned()).unwrap_or_else(|| "No active connection".into());
        (rates.0, rates.1, connection_name)
    }
}

fn process_stats() -> (usize, Vec<ProcessStat>) {
    unsafe {
        let mut pids = vec![0u32; 4096];
        let mut bytes_needed = 0u32;
        if EnumProcesses(pids.as_mut_ptr(), (pids.len() * std::mem::size_of::<u32>()) as u32, &mut bytes_needed) == 0 {
            return (0, Vec::new());
        }
        let count = (bytes_needed as usize / std::mem::size_of::<u32>()).min(pids.len());
        pids.truncate(count);
        let system_delta = {
            let mut idle: FILETIME = zeroed();
            let mut kernel: FILETIME = zeroed();
            let mut user: FILETIME = zeroed();
            if GetSystemTimes(&mut idle, &mut kernel, &mut user) != 0 { filetime_value(kernel).saturating_add(filetime_value(user)) } else { 0 }
        };
        let mut current_times = HashMap::with_capacity(count);
        let mut processes = Vec::new();
        for pid in pids.iter().copied().filter(|pid| *pid != 0) {
            let process = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, 0, pid);
            if process.is_null() { continue; }
            let mut memory: PROCESS_MEMORY_COUNTERS = zeroed();
            memory.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
            let memory_ok = GetProcessMemoryInfo(process, &mut memory, memory.cb) != 0;
            let mut created: FILETIME = zeroed();
            let mut exited: FILETIME = zeroed();
            let mut kernel: FILETIME = zeroed();
            let mut user: FILETIME = zeroed();
            let cpu_time = if GetProcessTimes(process, &mut created, &mut exited, &mut kernel, &mut user) != 0 {
                filetime_value(kernel).saturating_add(filetime_value(user))
            } else { 0 };
            current_times.insert(pid, cpu_time);

            let mut image_path = [0u16; 1024];
            let mut path_length = image_path.len() as u32;
            let name = if QueryFullProcessImageNameW(process, 0, image_path.as_mut_ptr(), &mut path_length) != 0 {
                let path = OsString::from_wide(&image_path[..path_length as usize]);
                Path::new(&path).file_name().map(|part| part.to_string_lossy().into_owned()).unwrap_or_else(|| path.to_string_lossy().into_owned())
            } else { format!("Process {pid}") };
            CloseHandle(process);
            if !memory_ok { continue; }

            let cpu_percent = LAST_PROCESS_TIMES.lock().ok().and_then(|previous| previous.as_ref().and_then(|map| map.get(&pid).copied()))
                .map(|old| if system_delta == 0 { 0.0 } else { cpu_time.saturating_sub(old) as f64 / system_delta as f64 * 100.0 })
                .unwrap_or(0.0);
            processes.push(ProcessStat { name, memory_bytes: memory.WorkingSetSize as u64, cpu_percent });
        }
        if let Ok(mut previous) = LAST_PROCESS_TIMES.lock() { *previous = Some(current_times); }
        processes.sort_by(|a, b| b.memory_bytes.cmp(&a.memory_bytes));
        processes.truncate(5);
        (count, processes)
    }
}

#[tauri::command]
pub fn get_system_stats() -> SystemStats {
    let (memory_used_bytes, memory_total_bytes, memory_percent) = sample_memory();
    let (disk_name, disk_used_bytes, disk_total_bytes) = sample_disk();
    let (network_download_bps, network_upload_bps, network_connection_name) = sample_network();
    let (process_count, processes) = process_stats();
    let mut battery_percent = None;
    let mut battery_seconds_remaining = None;
    let mut is_plugged = false;
    unsafe {
        let mut power: SYSTEM_POWER_STATUS = zeroed();
        if GetSystemPowerStatus(&mut power) != 0 {
            if power.BatteryLifePercent <= 100 { battery_percent = Some(power.BatteryLifePercent); }
            if power.BatteryLifeTime != u32::MAX { battery_seconds_remaining = Some(power.BatteryLifeTime as u64); }
            is_plugged = power.ACLineStatus == 1;
        }
    }
    SystemStats {
        cpu_percent: sample_cpu(),
        memory_used_bytes,
        memory_total_bytes,
        memory_percent,
        gpu_percent: sample_gpu(),
        disk_name,
        disk_used_bytes,
        disk_total_bytes,
        network_download_bps,
        network_upload_bps,
        network_connection_name,
        battery_percent,
        battery_seconds_remaining,
        is_plugged,
        uptime_seconds: unsafe { GetTickCount64() / 1000 },
        process_count,
        processes,
    }
}

#[tauri::command]
pub fn test_network_latency() -> Result<NetworkTest, String> {
    let address = SocketAddr::from(([1, 1, 1, 1], 443));
    let mut samples = Vec::new();
    for _ in 0..4 {
        let started = Instant::now();
        TcpStream::connect_timeout(&address, Duration::from_millis(1400))
            .map_err(|error| format!("Could not reach Cloudflare DNS over TCP: {error}"))?;
        samples.push(started.elapsed().as_secs_f64() * 1000.0);
        std::thread::sleep(Duration::from_millis(90));
    }
    let latency = samples.iter().sum::<f64>() / samples.len() as f64;
    let jitter = samples.windows(2).map(|pair| (pair[1] - pair[0]).abs()).sum::<f64>() / (samples.len() - 1) as f64;
    Ok(NetworkTest { latency_ms: latency, jitter_ms: jitter })
}
