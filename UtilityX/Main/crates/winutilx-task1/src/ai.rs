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

const API_HOST: &str = "generativelanguage.googleapis.com";
const MODEL: &str = "gemini-3.8-flash";
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
    Ok(app.path().app_data_dir().map_err(|error| format!("Could not locate UtilityX app data: {error}"))?.join("ai").join("gemini-key.dpapi"))
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
    String::from_utf8(bytes).map_err(|_| "The saved Gemini API key could not be read.".into())
}

fn read_saved_key(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let path = key_path(app)?;
    if !path.exists() { return Ok(None); }
    let encrypted = std::fs::read(path).map_err(|error| format!("Could not read the encrypted Gemini API key: {error}"))?;
    Ok(Some(unprotect_key(&encrypted)?))
}

fn validate_key(key: &str) -> Result<(), String> {
    if key.trim().is_empty() { return Err("Enter a Gemini API key first.".into()); }
    if key.len() > 512 || !key.is_ascii() || key.bytes().any(|byte| byte.is_ascii_whitespace() || byte.is_ascii_control()) {
        return Err("That does not look like a valid Gemini API key.".into());
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
    let parent = path.parent().ok_or_else(|| "Could not locate UtilityX AI settings storage.".to_string())?;
    std::fs::create_dir_all(parent).map_err(|error| format!("Could not prepare encrypted AI settings storage: {error}"))?;
    let encrypted = protect_key(key)?;
    std::fs::write(path, encrypted).map_err(|error| format!("Could not save the encrypted Gemini API key: {error}"))
}

#[tauri::command]
pub fn ai_delete_key(app: tauri::AppHandle) -> Result<(), String> {
    let path = key_path(&app)?;
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Could not remove the saved Gemini API key: {error}")),
    }
}

fn winhttp_error(context: &str) -> String {
    format!("{context} (Windows network error {}).", unsafe { GetLastError() })
}

fn post_gemini(key: &str, body: &Value) -> Result<Value, String> {
    validate_key(key)?;
    let agent: Vec<u16> = "UtilityX Circle Search".encode_utf16().chain(Some(0)).collect();
    let host: Vec<u16> = API_HOST.encode_utf16().chain(Some(0)).collect();
    let path: Vec<u16> = format!("/v1beta/models/{MODEL}:generateContent").encode_utf16().chain(Some(0)).collect();
    let version: Vec<u16> = "HTTP/1.1".encode_utf16().chain(Some(0)).collect();
    let body = serde_json::to_vec(body).map_err(|error| format!("Could not prepare the Gemini request: {error}"))?;
    let headers: Vec<u16> = format!("Content-Type: application/json\r\nx-goog-api-key: {key}\r\n").encode_utf16().chain(Some(0)).collect();

    unsafe {
        let session = WinHttpOpen(agent.as_ptr(), WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, std::ptr::null(), std::ptr::null(), 0);
        if session.is_null() { return Err(winhttp_error("Could not initialize Gemini network access")); }
        // Keep a stalled provider from leaving Circle Search waiting for a minute.
        WinHttpSetTimeouts(session, 5000, 5000, 8000, 15000);
        let connection = WinHttpConnect(session, host.as_ptr(), 443, 0);
        if connection.is_null() {
            let error = winhttp_error("Could not connect to Gemini");
            WinHttpCloseHandle(session);
            return Err(error);
        }
        let request = WinHttpOpenRequest(connection, "POST\0".encode_utf16().collect::<Vec<_>>().as_ptr(), path.as_ptr(), version.as_ptr(), std::ptr::null(), std::ptr::null(), WINHTTP_FLAG_SECURE);
        if request.is_null() {
            let error = winhttp_error("Could not prepare a Gemini request");
            WinHttpCloseHandle(connection); WinHttpCloseHandle(session);
            return Err(error);
        }
        let sent = WinHttpSendRequest(request, headers.as_ptr(), u32::MAX, body.as_ptr().cast_mut().cast(), body.len() as u32, body.len() as u32, 0);
        if sent == 0 || WinHttpReceiveResponse(request, std::ptr::null_mut()) == 0 {
            let error = winhttp_error("Gemini did not respond");
            WinHttpCloseHandle(request); WinHttpCloseHandle(connection); WinHttpCloseHandle(session);
            return Err(error);
        }
        let mut status = 0u32;
        let mut status_size = std::mem::size_of::<u32>() as u32;
        if WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, std::ptr::null(), (&mut status as *mut u32).cast(), &mut status_size, std::ptr::null_mut()) == 0 {
            let error = winhttp_error("Could not read Gemini's response status");
            WinHttpCloseHandle(request); WinHttpCloseHandle(connection); WinHttpCloseHandle(session);
            return Err(error);
        }
        let mut response = Vec::new();
        loop {
            let mut available = 0u32;
            if WinHttpQueryDataAvailable(request, &mut available) == 0 {
                let error = winhttp_error("Could not read Gemini's response");
                WinHttpCloseHandle(request); WinHttpCloseHandle(connection); WinHttpCloseHandle(session);
                return Err(error);
            }
            if available == 0 { break; }
            if response.len().saturating_add(available as usize) > 2_000_000 {
                WinHttpCloseHandle(request); WinHttpCloseHandle(connection); WinHttpCloseHandle(session);
                return Err("Gemini returned an unexpectedly large response.".into());
            }
            let old_len = response.len();
            response.resize(old_len + available as usize, 0);
            let mut read = 0u32;
            if WinHttpReadData(request, response[old_len..].as_mut_ptr().cast(), available, &mut read) == 0 {
                let error = winhttp_error("Could not read Gemini's response");
                WinHttpCloseHandle(request); WinHttpCloseHandle(connection); WinHttpCloseHandle(session);
                return Err(error);
            }
            response.truncate(old_len + read as usize);
        }
        WinHttpCloseHandle(request); WinHttpCloseHandle(connection); WinHttpCloseHandle(session);
        let parsed: Value = serde_json::from_slice(&response).map_err(|_| format!("Gemini returned an unreadable response (HTTP {status})."))?;
        if !(200..300).contains(&status) {
            let message = parsed.get("error").and_then(|error| error.get("message")).and_then(Value::as_str).unwrap_or("Gemini rejected the request.");
            return Err(format!("{message} (HTTP {status})"));
        }
        Ok(parsed)
    }
}

fn post_gemini_with_retry(key: &str, body: &Value) -> Result<Value, String> {
    match post_gemini(key, body) {
        // A 429 may mean exhausted quota or billing and another request will not fix it.
        // Only retry transient upstream server errors.
        Err(error) if ["HTTP 500)", "HTTP 502)", "HTTP 503)", "HTTP 504)"].iter().any(|status| error.contains(status)) => {
            std::thread::sleep(std::time::Duration::from_millis(900));
            post_gemini(key, body)
        }
        result => result,
    }
}

fn text_request(text: &str) -> Value {
    json!({ "contents": [{ "parts": [{ "text": text }] }], "generationConfig": { "maxOutputTokens": 16, "thinkingConfig": { "thinkingLevel": "minimal" } } })
}

#[tauri::command]
pub async fn ai_test_key(app: tauri::AppHandle, api_key: Option<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || test_key_blocking(app, api_key))
        .await.map_err(|error| format!("The Gemini connection check stopped: {error}"))?
}

fn test_key_blocking(app: tauri::AppHandle, api_key: Option<String>) -> Result<String, String> {
    let key = match api_key.filter(|key| !key.trim().is_empty()) {
        Some(key) => key.trim().to_owned(),
        None => read_saved_key(&app)?.ok_or_else(|| "No Gemini API key is saved yet.".to_string())?,
    };
    let response = post_gemini_with_retry(&key, &text_request("Reply with exactly: UtilityX connection successful"))?;
    if response.get("candidates").and_then(Value::as_array).and_then(|items| items.first())
        .and_then(|candidate| candidate.pointer("content.parts"))
        .and_then(Value::as_array)
        .is_some_and(|parts| parts.iter().any(|part| part.get("text").and_then(Value::as_str).is_some_and(|text| !text.trim().is_empty()))) {
        Ok("Gemini API connection successful.".into())
    } else {
        Err(response.pointer("/candidates/0/finishReason").and_then(Value::as_str)
            .map(|reason| format!("Gemini accepted the key but returned no text (finish reason: {reason})."))
            .unwrap_or_else(|| "Gemini accepted the key but returned no text. Check that this key can use the selected model.".into()))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSource { pub title: String, pub url: String }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiAnswer { pub answer: String, pub sources: Vec<AiSource>, pub search_queries: Vec<String> }

fn candidate_text(response: &Value) -> String {
    response.get("candidates").and_then(Value::as_array).and_then(|items| items.first())
        .and_then(|candidate| candidate.pointer("content.parts"))
        .and_then(Value::as_array)
        .map(|parts| parts.iter().filter_map(|part| part.get("text").and_then(Value::as_str)).collect::<Vec<_>>().join("\n"))
        .unwrap_or_default()
}

#[tauri::command]
pub async fn ai_circle_search(app: tauri::AppHandle, image_base64: String, prompt: String, search_web: bool) -> Result<AiAnswer, String> {
    tauri::async_runtime::spawn_blocking(move || run_circle_search(app, image_base64, prompt, search_web))
        .await.map_err(|error| format!("The Circle Search worker stopped: {error}"))?
}

fn run_circle_search(app: tauri::AppHandle, image_base64: String, prompt: String, search_web: bool) -> Result<AiAnswer, String> {
    let key = read_saved_key(&app)?.ok_or_else(|| "No Gemini API key is saved. Open Settings → AI & API Keys to add one.".to_string())?;
    if image_base64.is_empty() || image_base64.len() > 18_000_000 || !image_base64.bytes().all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'+' | b'/' | b'=')) {
        return Err("The selected screenshot could not be prepared. Draw a smaller selection and retry.".into());
    }
    let question = prompt.trim();
    let question = if question.is_empty() { "Identify the main thing in this selected screen area and explain what it is. Keep the answer concise and mention uncertainty." } else { question };
    let mut body = json!({
        "contents": [{"parts": [
            {"inline_data": {"mime_type": "image/jpeg", "data": image_base64}},
            {"text": question}
        ]}]
    });
    if search_web { body["tools"] = json!([{"google_search": {}}]); }
    let response = post_gemini_with_retry(&key, &body)?;
    let answer = candidate_text(&response);
    let candidate = response.get("candidates").and_then(Value::as_array).and_then(|items| items.first()).ok_or_else(|| {
        response.pointer("promptFeedback.blockReason").and_then(Value::as_str)
            .map(|reason| format!("Gemini could not answer this selection ({reason})."))
            .unwrap_or_else(|| "Gemini returned no answer for this selection.".into())
    })?;
    if answer.trim().is_empty() {
        let reason = candidate.get("finishReason").and_then(Value::as_str).unwrap_or("unspecified");
        let detail = match reason {
            "MAX_TOKENS" => "Gemini used its response budget before producing text. Try a smaller crop or a shorter question.",
            "SAFETY" | "IMAGE_SAFETY" | "PROHIBITED_CONTENT" | "BLOCKLIST" => "Gemini blocked this response. Try a different screen selection or question.",
            "RECITATION" => "Gemini could not provide text for this selection. Try a different crop or question.",
            _ => "Gemini returned no text. Try again or ask a specific question.",
        };
        let model = response.get("modelVersion").and_then(Value::as_str).unwrap_or(MODEL);
        let output_tokens = response.pointer("/usageMetadata/candidatesTokenCount").and_then(Value::as_u64).unwrap_or(0);
        let part_shape = candidate.pointer("content.parts").and_then(Value::as_array).map(|parts| {
            parts.iter().map(|part| part.as_object().map(|fields| fields.keys().cloned().collect::<Vec<_>>().join("+")).unwrap_or_else(|| "non-object".into())).collect::<Vec<_>>().join(", ")
        }).filter(|shape| !shape.is_empty()).unwrap_or_else(|| "no parts".into());
        return Err(format!("{detail} (finish reason: {reason}; model: {model}; output tokens: {output_tokens}; part shape: {part_shape})"));
    }
    let metadata = candidate.get("groundingMetadata");
    let mut sources = Vec::new();
    if let Some(chunks) = metadata.and_then(|value| value.get("groundingChunks")).and_then(Value::as_array) {
        for chunk in chunks {
            if let Some(web) = chunk.get("web") {
                let url = web.get("uri").and_then(Value::as_str).unwrap_or("");
                if url.starts_with("https://") && !sources.iter().any(|source: &AiSource| source.url == url) {
                    sources.push(AiSource { title: web.get("title").and_then(Value::as_str).unwrap_or(url).to_owned(), url: url.to_owned() });
                }
            }
        }
    }
    let search_queries = metadata.and_then(|value| value.get("webSearchQueries")).and_then(Value::as_array)
        .map(|items| items.iter().filter_map(Value::as_str).map(str::to_owned).collect()).unwrap_or_default();
    Ok(AiAnswer { answer, sources, search_queries })
}
