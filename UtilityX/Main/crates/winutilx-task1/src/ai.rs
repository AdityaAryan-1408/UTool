use serde::Serialize;
use serde_json::{json, Value};
use std::ffi::c_void;
use windows_sys::Win32::Foundation::GetLastError;
use windows_sys::Win32::Networking::WinHttp::{
    WinHttpCloseHandle, WinHttpConnect, WinHttpOpen, WinHttpOpenRequest,
    WinHttpQueryDataAvailable, WinHttpQueryHeaders, WinHttpReadData,
    WinHttpReceiveResponse, WinHttpSendRequest, WinHttpSetTimeouts,
    WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_FLAG_SECURE,
    WINHTTP_QUERY_FLAG_NUMBER, WINHTTP_QUERY_STATUS_CODE,
};

const API_HOST: &str = "api.groq.com";
const MODEL: &str = "qwen/qwen3.8-27b";
const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;

#[repr(C)]
struct DataBlob { size: u32, data: *mut u8 }

#[link(name = "Crypt32")]
extern "system" {
    fn CryptProtectData(input: *const DataBlob, description: *const u16, entropy: *const DataBlob, reserved: *mut c_void, prompt: *mut c_void, flags: u32, output: *mut DataBlob) -> i32;
    fn CryptUnprotectData(input: *const DataBlob, description: *mut *mut u16, entropy: *const DataBlob, reserved: *mut c_void, prompt: *mut c_void, flags: u32, output: *mut DataBlob) -> i32;
}

#[link(name = "Kernel32")]
extern "system" { fn LocalFree(memory: *mut c_void) -> *mut c_void; }

fn key_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    Ok(app.path().app_data_dir().map_err(|error| format!("Could not locate Ollumi app data: {error}"))?.join("ai").join("groq-key.dpapi"))
}

fn legacy_key_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(key_path(app)?.with_file_name("gemini-key.dpapi"))
}

fn protect_key(key: &str) -> Result<Vec<u8>, String> {
    let mut input_bytes = key.as_bytes().to_vec();
    let input = DataBlob { size: input_bytes.len() as u32, data: input_bytes.as_mut_ptr() };
    let mut output = DataBlob { size: 0, data: std::ptr::null_mut() };
    let ok = unsafe { CryptProtectData(&input, std::ptr::null(), std::ptr::null(), std::ptr::null_mut(), std::ptr::null_mut(), CRYPTPROTECT_UI_FORBIDDEN, &mut output) };
    input_bytes.fill(0);
    if ok == 0 { return Err(format!("Windows could not encrypt the API key (error {}).", unsafe { GetLastError() })); }
    let encrypted = unsafe { std::slice::from_raw_parts(output.data, output.size as usize).to_vec() };
    unsafe { LocalFree(output.data.cast()); }
    Ok(encrypted)
}

fn unprotect_key(encrypted: &[u8]) -> Result<String, String> {
    let input = DataBlob { size: encrypted.len() as u32, data: encrypted.as_ptr() as *mut u8 };
    let mut output = DataBlob { size: 0, data: std::ptr::null_mut() };
    let ok = unsafe { CryptUnprotectData(&input, std::ptr::null_mut(), std::ptr::null(), std::ptr::null_mut(), std::ptr::null_mut(), CRYPTPROTECT_UI_FORBIDDEN, &mut output) };
    if ok == 0 { return Err(format!("Windows could not decrypt the saved API key (error {}).", unsafe { GetLastError() })); }
    let bytes = unsafe { std::slice::from_raw_parts(output.data, output.size as usize).to_vec() };
    unsafe { LocalFree(output.data.cast()); }
    String::from_utf8(bytes).map_err(|_| "The saved Groq API key could not be read.".into())
}

fn read_saved_key(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let path = key_path(app)?;
    if !path.exists() { return Ok(None); }
    let encrypted = std::fs::read(path).map_err(|error| format!("Could not read the encrypted Groq API key: {error}"))?;
    Ok(Some(unprotect_key(&encrypted)?))
}

fn validate_key(key: &str) -> Result<(), String> {
    if key.trim().is_empty() { return Err("Enter a Groq API key first.".into()); }
    if key.len() > 512 || !key.is_ascii() || key.bytes().any(|byte| byte.is_ascii_whitespace() || byte.is_ascii_control()) {
        return Err("That does not look like a valid Groq API key.".into());
    }
    Ok(())
}

#[tauri::command]
pub fn ai_key_status(app: tauri::AppHandle) -> Result<bool, String> {
    Ok(read_saved_key(&app)?.is_some())
}

#[tauri::command]
pub fn ai_save_key(app: tauri::AppHandle, api_key: String) -> Result<(), String> {
    let key = api_key.trim();
    validate_key(key)?;
    let path = key_path(&app)?;
    let parent = path.parent().ok_or_else(|| "Could not locate Ollumi AI settings storage.".to_string())?;
    std::fs::create_dir_all(parent).map_err(|error| format!("Could not prepare encrypted AI settings storage: {error}"))?;
    let encrypted = protect_key(key)?;
    std::fs::write(&path, encrypted).map_err(|error| format!("Could not save the encrypted Groq API key: {error}"))?;
    // Discard the obsolete encrypted Gemini credential without decrypting or using it.
    let _ = std::fs::remove_file(legacy_key_path(&app)?);
    Ok(())
}

#[tauri::command]
pub fn ai_delete_key(app: tauri::AppHandle) -> Result<(), String> {
    for path in [key_path(&app)?, legacy_key_path(&app)?] {
        match std::fs::remove_file(path) {
            Ok(()) => (),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
            Err(error) => return Err(format!("Could not remove a saved AI API key: {error}")),
        }
    }
    Ok(())
}

fn winhttp_error(context: &str) -> String {
    format!("{context} (Windows network error {}).", unsafe { GetLastError() })
}

fn post_groq(key: &str, body: &Value) -> Result<Value, String> {
    validate_key(key)?;
    let agent: Vec<u16> = "Ollumi Circle Search".encode_utf16().chain(Some(0)).collect();
    let host: Vec<u16> = API_HOST.encode_utf16().chain(Some(0)).collect();
    let path: Vec<u16> = "/openai/v1/chat/completions".encode_utf16().chain(Some(0)).collect();
    let version: Vec<u16> = "HTTP/1.1".encode_utf16().chain(Some(0)).collect();
    let body = serde_json::to_vec(body).map_err(|error| format!("Could not prepare the Groq request: {error}"))?;
    let headers: Vec<u16> = format!("Content-Type: application/json\r\nAuthorization: Bearer {key}\r\n").encode_utf16().chain(Some(0)).collect();

    unsafe {
        let session = WinHttpOpen(agent.as_ptr(), WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, std::ptr::null(), std::ptr::null(), 0);
        if session.is_null() { return Err(winhttp_error("Could not initialize Groq network access")); }
        WinHttpSetTimeouts(session, 5000, 8000, 15000, 35000);
        let connection = WinHttpConnect(session, host.as_ptr(), 443, 0);
        if connection.is_null() {
            let error = winhttp_error("Could not connect to Groq");
            WinHttpCloseHandle(session);
            return Err(error);
        }
        let request = WinHttpOpenRequest(connection, "POST\0".encode_utf16().collect::<Vec<_>>().as_ptr(), path.as_ptr(), version.as_ptr(), std::ptr::null(), std::ptr::null(), WINHTTP_FLAG_SECURE);
        if request.is_null() {
            let error = winhttp_error("Could not prepare a Groq request");
            WinHttpCloseHandle(connection); WinHttpCloseHandle(session);
            return Err(error);
        }
        let sent = WinHttpSendRequest(request, headers.as_ptr(), u32::MAX, body.as_ptr().cast_mut().cast(), body.len() as u32, body.len() as u32, 0);
        if sent == 0 || WinHttpReceiveResponse(request, std::ptr::null_mut()) == 0 {
            let error = winhttp_error("Groq did not respond");
            WinHttpCloseHandle(request); WinHttpCloseHandle(connection); WinHttpCloseHandle(session);
            return Err(error);
        }
        let mut status = 0u32;
        let mut status_size = std::mem::size_of::<u32>() as u32;
        if WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, std::ptr::null(), (&mut status as *mut u32).cast(), &mut status_size, std::ptr::null_mut()) == 0 {
            let error = winhttp_error("Could not read Groq's response status");
            WinHttpCloseHandle(request); WinHttpCloseHandle(connection); WinHttpCloseHandle(session);
            return Err(error);
        }
        let mut response = Vec::new();
        loop {
            let mut available = 0u32;
            if WinHttpQueryDataAvailable(request, &mut available) == 0 {
                let error = winhttp_error("Could not read Groq's response");
                WinHttpCloseHandle(request); WinHttpCloseHandle(connection); WinHttpCloseHandle(session);
                return Err(error);
            }
            if available == 0 { break; }
            if response.len().saturating_add(available as usize) > 2_000_000 {
                WinHttpCloseHandle(request); WinHttpCloseHandle(connection); WinHttpCloseHandle(session);
                return Err("Groq returned an unexpectedly large response.".into());
            }
            let old_len = response.len();
            response.resize(old_len + available as usize, 0);
            let mut read = 0u32;
            if WinHttpReadData(request, response[old_len..].as_mut_ptr().cast(), available, &mut read) == 0 {
                let error = winhttp_error("Could not read Groq's response");
                WinHttpCloseHandle(request); WinHttpCloseHandle(connection); WinHttpCloseHandle(session);
                return Err(error);
            }
            response.truncate(old_len + read as usize);
        }
        WinHttpCloseHandle(request); WinHttpCloseHandle(connection); WinHttpCloseHandle(session);
        let parsed: Value = serde_json::from_slice(&response).map_err(|_| format!("Groq returned an unreadable response (HTTP {status})."))?;
        if !(200..300).contains(&status) {
            let api_error = parsed.get("error");
            let message = api_error.and_then(|error| error.get("message")).and_then(Value::as_str).unwrap_or("Groq rejected the request.");
            let details = api_error.and_then(|error| serde_json::to_string(error).ok()).map(|mut details| {
                if !key.is_empty() { details = details.replace(key, "[redacted]"); }
                details.chars().take(1400).collect::<String>()
            });
            return Err(match details {
                Some(details) => format!("{message} (HTTP {status}; API error: {details})"),
                None => format!("{message} (HTTP {status})"),
            });
        }
        Ok(parsed)
    }
}

fn post_groq_with_retry(key: &str, body: &Value) -> Result<Value, String> {
    match post_groq(key, body) {
        Err(error) if ["HTTP 500)", "HTTP 502)", "HTTP 503)", "HTTP 504)"].iter().any(|status| error.contains(status)) => {
            std::thread::sleep(std::time::Duration::from_millis(900));
            post_groq(key, body)
        }
        result => result,
    }
}

fn text_request(text: &str) -> Value {
    json!({
        "model": MODEL,
        "messages": [{"role": "user", "content": text}],
        "max_completion_tokens": 128,
        "reasoning_effort": "none",
        "temperature": 0.7,
        "stream": false
    })
}

#[tauri::command]
pub async fn ai_test_key(app: tauri::AppHandle, api_key: Option<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || test_key_blocking(app, api_key))
        .await.map_err(|error| format!("The Groq connection check stopped: {error}"))?
}

fn test_key_blocking(app: tauri::AppHandle, api_key: Option<String>) -> Result<String, String> {
    let key = match api_key.filter(|key| !key.trim().is_empty()) {
        Some(key) => key.trim().to_owned(),
        None => read_saved_key(&app)?.ok_or_else(|| "No Groq API key is saved yet.".to_string())?,
    };
    let response = post_groq_with_retry(&key, &text_request("Reply with exactly: Ollumi connection successful"))?;
    if response.pointer("/choices/0/message/content").and_then(Value::as_str).is_some_and(|text| !text.trim().is_empty()) {
        Ok("Groq API connection successful.".into())
    } else {
        let reason = response.pointer("/choices/0/finish_reason").and_then(Value::as_str).unwrap_or("unspecified");
        Err(format!("Groq accepted the key but returned no text (finish reason: {reason})."))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSource { pub title: String, pub url: String }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAnswer { pub answer: String, pub sources: Vec<AiSource>, pub search_queries: Vec<String> }

#[tauri::command]
pub async fn ai_circle_search(app: tauri::AppHandle, image_base64: String, prompt: String) -> Result<AiAnswer, String> {
    tauri::async_runtime::spawn_blocking(move || run_circle_search(app, image_base64, prompt))
        .await.map_err(|error| format!("The Circle Search worker stopped: {error}"))?
}

fn run_circle_search(app: tauri::AppHandle, image_base64: String, prompt: String) -> Result<AiAnswer, String> {
    let key = read_saved_key(&app)?.ok_or_else(|| "No Groq API key is saved. Open Settings → AI & API Keys to add one.".to_string())?;
    if image_base64.is_empty() || image_base64.len() > 18_000_000 || !image_base64.bytes().all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'+' | b'/' | b'=')) {
        return Err("The selected screenshot could not be prepared. Draw a smaller selection and retry.".into());
    }
    let question = prompt.trim();
    let question = if question.is_empty() { "Identify the main thing in this selected screen area and explain what it is. Reply with one concise sentence, and mention uncertainty if needed." } else { question };
    let data_url = format!("data:image/jpeg;base64,{image_base64}");
    let body = json!({
        "model": MODEL,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": question},
            {"type": "image_url", "image_url": {"url": data_url}}
        ]}],
        "max_completion_tokens": 512,
        "reasoning_effort": "none",
        "temperature": 0.7,
        "stream": false
    });
    let response = post_groq_with_retry(&key, &body)?;
    let answer = response.pointer("/choices/0/message/content").and_then(Value::as_str).unwrap_or_default().trim().to_owned();
    if answer.is_empty() {
        let reason = response.pointer("/choices/0/finish_reason").and_then(Value::as_str).unwrap_or("unspecified");
        return Err(format!("Groq returned no text for this selection (finish reason: {reason}). Try again or ask a specific question."));
    }
    Ok(AiAnswer { answer, sources: Vec::new(), search_queries: Vec::new() })
}
