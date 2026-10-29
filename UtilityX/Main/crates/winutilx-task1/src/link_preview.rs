use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::ffi::c_void;
use std::net::{IpAddr, Ipv4Addr, ToSocketAddrs};
use std::sync::Mutex;
use tauri::Manager;
use windows_sys::Win32::Foundation::GetLastError;
use windows_sys::Win32::Networking::WinHttp::{
    WinHttpCloseHandle, WinHttpConnect, WinHttpOpen, WinHttpOpenRequest,
    WinHttpQueryDataAvailable, WinHttpQueryHeaders, WinHttpReadData,
    WinHttpReceiveResponse, WinHttpSendRequest, WinHttpSetTimeouts,
    WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_FLAG_SECURE,
    WINHTTP_QUERY_FLAG_NUMBER, WINHTTP_QUERY_STATUS_CODE,
};

#[link(name = "winhttp")]
extern "system" {
    fn WinHttpSetOption(request: *mut c_void, option: u32, buffer: *mut c_void, buffer_length: u32) -> i32;
}

const MAX_HTML_BYTES: usize = 64 * 1024;
static CACHE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkPreview {
    pub url: String,
    pub domain: String,
    pub title: String,
    pub description: String,
    pub favicon_url: String,
    pub image_url: String,
}

fn cache_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|error| format!("Could not locate Ollumi app data: {error}"))?.join("link-previews").join("cache.json"))
}

fn parse_http_url(raw: &str) -> Result<(bool, String, u16, String, String), String> {
    let raw = raw.trim();
    if raw.len() > 4096 { return Err("This link is too long to preview.".into()); }
    let (secure, rest) = if let Some(rest) = raw.strip_prefix("https://") { (true, rest) }
        else if let Some(rest) = raw.strip_prefix("http://") { (false, rest) }
        else { return Err("Only HTTP and HTTPS links can be previewed.".into()); };
    let authority_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let authority = &rest[..authority_end];
    if authority.is_empty() || authority.contains('@') { return Err("This link has an invalid host.".into()); }
    let (host, port) = if authority.starts_with('[') {
        let close = authority.find(']').ok_or("This link has an invalid IPv6 host.")?;
        let host = authority[1..close].to_string();
        let port = authority[close + 1..].strip_prefix(':').and_then(|value| value.parse::<u16>().ok()).unwrap_or(if secure { 443 } else { 80 });
        (host, port)
    } else if let Some((host, suffix)) = authority.rsplit_once(':') {
        if !suffix.is_empty() && suffix.bytes().all(|byte| byte.is_ascii_digit()) {
            (host.to_string(), suffix.parse::<u16>().map_err(|_| "This link has an invalid port.")?)
        } else { (authority.to_string(), if secure { 443 } else { 80 }) }
    } else { (authority.to_string(), if secure { 443 } else { 80 }) };
    if host.is_empty() || port == 0 { return Err("This link has an invalid host or port.".into()); }
    let remainder = &rest[authority_end..];
    let without_fragment = remainder.split('#').next().unwrap_or("");
    let path = if without_fragment.is_empty() { "/".to_string() }
        else if without_fragment.starts_with('?') { format!("/{without_fragment}") }
        else { without_fragment.to_string() };
    Ok((secure, host, port, path, authority.to_string()))
}

fn is_public_ipv4(ip: Ipv4Addr) -> bool {
    let octets = ip.octets();
    !(ip.is_private() || ip.is_loopback() || ip.is_link_local() || ip.is_broadcast() || ip.is_multicast()
        || ip.is_unspecified() || octets[0] == 0 || octets[0] >= 240
        || (octets[0] == 100 && (64..=127).contains(&octets[1]))
        || (octets[0] == 192 && octets[1] == 0 && octets[2] == 0)
        || (octets[0] == 192 && octets[1] == 0 && octets[2] == 2)
        || (octets[0] == 198 && (octets[1] == 18 || octets[1] == 19))
        || (octets[0] == 198 && octets[1] == 51 && octets[2] == 100)
        || (octets[0] == 203 && octets[1] == 0 && octets[2] == 113))
}

fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => is_public_ipv4(ip),
        IpAddr::V6(ip) => {
            if let Some(mapped) = ip.to_ipv4_mapped() { return is_public_ipv4(mapped); }
            let segments = ip.segments();
            !(ip.is_loopback() || ip.is_unspecified() || ip.is_unique_local() || ip.is_unicast_link_local()
                || ip.is_multicast() || (segments[0] & 0xffc0) == 0xfec0
                || (segments[0] == 0x2001 && segments[1] == 0x0db8))
        }
    }
}

fn ensure_public_host(host: &str, port: u16) -> Result<(), String> {
    if host.eq_ignore_ascii_case("localhost") || host.ends_with(".localhost") || host.ends_with(".local") {
        return Err("Link previews are disabled for local network addresses.".into());
    }
    let addresses = (host, port).to_socket_addrs()
        .map_err(|_| "Could not resolve this link's host for a safe preview.".to_string())?;
    let mut found = false;
    for address in addresses {
        found = true;
        if !is_public_ip(address.ip()) {
            return Err("Link previews are disabled for local or reserved network addresses.".into());
        }
    }
    if !found { return Err("Could not resolve this link's host for a safe preview.".into()); }
    Ok(())
}

fn is_safe_asset_url(url: &str) -> bool {
    parse_http_url(url).ok().is_some_and(|(_, host, port, _, _)| ensure_public_host(&host, port).is_ok())
}

fn fetch_html(url: &str) -> Result<(String, String), String> {
    let (secure, host, port, path, authority) = parse_http_url(url)?;
    ensure_public_host(&host, port)?;
    let agent: Vec<u16> = "Ollumi Link Preview".encode_utf16().chain(Some(0)).collect();
    let host_wide: Vec<u16> = host.encode_utf16().chain(Some(0)).collect();
    let path_wide: Vec<u16> = path.encode_utf16().chain(Some(0)).collect();
    let version: Vec<u16> = "HTTP/1.1".encode_utf16().chain(Some(0)).collect();
    let method: Vec<u16> = "GET\0".encode_utf16().collect();
    let headers: Vec<u16> = "Accept: text/html,application/xhtml+xml\r\nAccept-Encoding: identity\r\n".encode_utf16().chain(Some(0)).collect();

    unsafe {
        let session = WinHttpOpen(agent.as_ptr(), WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, std::ptr::null(), std::ptr::null(), 0);
        if session.is_null() { return Err(format!("Could not initialize link preview request (Windows error {}).", GetLastError())); }
        WinHttpSetTimeouts(session, 3500, 3500, 5000, 6500);
        let connection = WinHttpConnect(session, host_wide.as_ptr(), port, 0);
        if connection.is_null() {
            let error = format!("Could not connect to {host} (Windows error {}).", GetLastError());
            WinHttpCloseHandle(session);
            return Err(error);
        }
        let request = WinHttpOpenRequest(connection, method.as_ptr(), path_wide.as_ptr(), version.as_ptr(), std::ptr::null(), std::ptr::null(), if secure { WINHTTP_FLAG_SECURE } else { 0 });
        if request.is_null() {
            let error = format!("Could not prepare a request for {host} (Windows error {}).", GetLastError());
            WinHttpCloseHandle(connection); WinHttpCloseHandle(session);
            return Err(error);
        }
        // Do not let WinHTTP follow an attacker-controlled redirect to a local
        // service after the initial host has passed the public-address check.
        const WINHTTP_OPTION_DISABLE_FEATURE: u32 = 63;
        const WINHTTP_DISABLE_REDIRECTS: u32 = 0x0000_0002;
        let mut disabled_features = WINHTTP_DISABLE_REDIRECTS;
        if WinHttpSetOption(request, WINHTTP_OPTION_DISABLE_FEATURE, (&mut disabled_features as *mut u32).cast(), std::mem::size_of::<u32>() as u32) == 0 {
            let error = format!("Could not secure the link preview request (Windows error {}).", GetLastError());
            WinHttpCloseHandle(request); WinHttpCloseHandle(connection); WinHttpCloseHandle(session);
            return Err(error);
        }
        let sent = WinHttpSendRequest(request, headers.as_ptr(), u32::MAX, std::ptr::null_mut(), 0, 0, 0);
        if sent == 0 || WinHttpReceiveResponse(request, std::ptr::null_mut()) == 0 {
            let error = format!("Could not fetch link preview from {host} (Windows error {}).", GetLastError());
            WinHttpCloseHandle(request); WinHttpCloseHandle(connection); WinHttpCloseHandle(session);
            return Err(error);
        }
        let mut status = 0u32;
        let mut status_size = std::mem::size_of::<u32>() as u32;
        if WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, std::ptr::null(), (&mut status as *mut u32).cast(), &mut status_size, std::ptr::null_mut()) == 0 {
            let error = format!("Could not read the HTTP status for {host} (Windows error {}).", GetLastError());
            WinHttpCloseHandle(request); WinHttpCloseHandle(connection); WinHttpCloseHandle(session);
            return Err(error);
        }
        let mut body = Vec::with_capacity(MAX_HTML_BYTES);
        while body.len() < MAX_HTML_BYTES {
            let mut available = 0u32;
            if WinHttpQueryDataAvailable(request, &mut available) == 0 || available == 0 { break; }
            let count = (MAX_HTML_BYTES - body.len()).min(available as usize);
            let old_len = body.len();
            body.resize(old_len + count, 0);
            let mut read = 0u32;
            if WinHttpReadData(request, body[old_len..].as_mut_ptr().cast::<c_void>(), count as u32, &mut read) == 0 {
                let error = format!("Could not read {host}'s page metadata (Windows error {}).", GetLastError());
                WinHttpCloseHandle(request); WinHttpCloseHandle(connection); WinHttpCloseHandle(session);
                return Err(error);
            }
            body.truncate(old_len + read as usize);
        }
        WinHttpCloseHandle(request); WinHttpCloseHandle(connection); WinHttpCloseHandle(session);
        if !(200..300).contains(&status) { return Err(format!("The page returned HTTP {status}; link previews do not follow redirects.")); }
        Ok((String::from_utf8_lossy(&body).into_owned(), authority))
    }
}

fn html_unescape(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut remaining = value;
    while let Some(index) = remaining.find('&') {
        output.push_str(&remaining[..index]);
        remaining = &remaining[index..];
        let Some(end) = remaining.find(';').filter(|end| *end < 12) else { output.push('&'); remaining = &remaining[1..]; continue; };
        let entity = &remaining[1..end];
        let decoded = match entity.to_ascii_lowercase().as_str() {
            "amp" => Some('&'), "quot" => Some('"'), "apos" | "#39" => Some('\''),
            "lt" => Some('<'), "gt" => Some('>'), "nbsp" => Some(' '),
            _ if entity.starts_with("#x") || entity.starts_with("#X") => u32::from_str_radix(&entity[2..], 16).ok().and_then(char::from_u32),
            _ if entity.starts_with('#') => entity[1..].parse::<u32>().ok().and_then(char::from_u32),
            _ => None,
        };
        if let Some(character) = decoded { output.push(character); } else { output.push_str(&remaining[..=end]); }
        remaining = &remaining[end + 1..];
    }
    output.push_str(remaining);
    output
}

fn attributes(tag: &str) -> HashMap<String, String> {
    let bytes = tag.as_bytes();
    let mut index = 1usize;
    while index < bytes.len() && !bytes[index].is_ascii_whitespace() && bytes[index] != b'>' { index += 1; }
    let mut result = HashMap::new();
    while index < bytes.len() {
        while index < bytes.len() && (bytes[index].is_ascii_whitespace() || bytes[index] == b'/' || bytes[index] == b'>') { index += 1; }
        let start = index;
        while index < bytes.len() && !bytes[index].is_ascii_whitespace() && bytes[index] != b'=' && bytes[index] != b'>' { index += 1; }
        if start == index { break; }
        let name = String::from_utf8_lossy(&bytes[start..index]).to_ascii_lowercase();
        while index < bytes.len() && bytes[index].is_ascii_whitespace() { index += 1; }
        if index >= bytes.len() || bytes[index] != b'=' { continue; }
        index += 1;
        while index < bytes.len() && bytes[index].is_ascii_whitespace() { index += 1; }
        let value = if index < bytes.len() && (bytes[index] == b'\'' || bytes[index] == b'"') {
            let quote = bytes[index]; index += 1; let value_start = index;
            while index < bytes.len() && bytes[index] != quote { index += 1; }
            let value = String::from_utf8_lossy(&bytes[value_start..index]).into_owned();
            if index < bytes.len() { index += 1; }
            value
        } else {
            let value_start = index;
            while index < bytes.len() && !bytes[index].is_ascii_whitespace() && bytes[index] != b'>' { index += 1; }
            String::from_utf8_lossy(&bytes[value_start..index]).into_owned()
        };
        result.insert(name, html_unescape(&value));
    }
    result
}

fn meta_value(html: &str, key_name: &str, key_value: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let mut search_from = 0usize;
    while let Some(relative) = lower[search_from..].find("<meta") {
        let start = search_from + relative;
        let Some(end_rel) = html[start..].find('>') else { break; };
        let tag = &html[start..start + end_rel + 1];
        let attrs = attributes(tag);
        if attrs.get(key_name).is_some_and(|value| value.eq_ignore_ascii_case(key_value)) {
            if let Some(content) = attrs.get("content").filter(|value| !value.trim().is_empty()) { return Some(content.trim().to_string()); }
        }
        search_from = start + end_rel + 1;
    }
    None
}

fn title_tag(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let start = lower.find("<title")?;
    let content_start = html[start..].find('>')? + start + 1;
    let end = lower[content_start..].find("</title")? + content_start;
    let value = html_unescape(&html[content_start..end].replace(['\n', '\r', '\t'], " "));
    let value = value.split_whitespace().collect::<Vec<_>>().join(" ");
    (!value.is_empty()).then_some(value)
}

fn resolve_url(base: &str, reference: &str) -> String {
    let reference = html_unescape(reference.trim());
    if reference.starts_with("https://") || reference.starts_with("http://") { return reference; }
    let (secure, _host, _port, _path, authority) = match parse_http_url(base) { Ok(parsed) => parsed, Err(_) => return String::new() };
    let scheme = if secure { "https" } else { "http" };
    let origin = format!("{scheme}://{authority}");
    if reference.starts_with("//") { return format!("{scheme}:{reference}"); }
    if reference.starts_with('/') { return format!("{origin}{reference}"); }
    let (_, _, _, base_path, _) = match parse_http_url(base) { Ok(parsed) => parsed, Err(_) => return String::new() };
    let directory = base_path.split('?').next().unwrap_or("/").rsplit_once('/').map(|(prefix, _)| prefix).unwrap_or("");
    if directory.is_empty() { format!("{origin}/{reference}") }
    else { format!("{origin}{directory}/{reference}") }
}

fn parse_preview(url: &str, html: &str, authority: &str) -> LinkPreview {
    let domain = authority.trim_start_matches('[').split(']').next().unwrap_or(authority).split(':').next().unwrap_or(authority).to_string();
    let title = meta_value(html, "property", "og:title").or_else(|| meta_value(html, "name", "twitter:title"))
        .or_else(|| title_tag(html)).unwrap_or_else(|| domain.clone());
    let description = meta_value(html, "property", "og:description").or_else(|| meta_value(html, "name", "description"))
        .or_else(|| meta_value(html, "name", "twitter:description")).unwrap_or_default();
    let image_url = meta_value(html, "property", "og:image").or_else(|| meta_value(html, "name", "twitter:image"))
        .map(|value| resolve_url(url, &value)).filter(|value| is_safe_asset_url(value)).unwrap_or_default();
    let favicon_url = {
        let lower = html.to_ascii_lowercase();
        let mut search_from = 0usize;
        let mut found = None;
        while let Some(relative) = lower[search_from..].find("<link") {
            let start = search_from + relative;
            let Some(end_rel) = html[start..].find('>') else { break; };
            let tag = &html[start..start + end_rel + 1];
            let attrs = attributes(tag);
            if attrs.get("rel").is_some_and(|rel| rel.to_ascii_lowercase().split_whitespace().any(|part| part == "icon")) {
                if let Some(href) = attrs.get("href") { found = Some(resolve_url(url, href)); break; }
            }
            search_from = start + end_rel + 1;
        }
        found.filter(|value| !value.is_empty()).unwrap_or_else(|| resolve_url(url, "/favicon.ico"))
    };
    let favicon_url = if is_safe_asset_url(&favicon_url) { favicon_url } else { String::new() };
    LinkPreview { url: url.to_string(), domain, title, description, favicon_url, image_url }
}

fn get_preview_blocking(app: tauri::AppHandle, url: String) -> Result<LinkPreview, String> {
    let (_, host, port, _, _) = parse_http_url(&url)?;
    ensure_public_host(&host, port)?;
    let _guard = CACHE_LOCK.lock().map_err(|_| "Link preview cache is temporarily unavailable.".to_string())?;
    let path = cache_path(&app)?;
    let mut cache: HashMap<String, LinkPreview> = std::fs::read(&path).ok().and_then(|bytes| serde_json::from_slice(&bytes).ok()).unwrap_or_default();
    if let Some(cached) = cache.get(&url) { return Ok(cached.clone()); }
    let (html, authority) = fetch_html(&url)?;
    let preview = parse_preview(&url, &html, &authority);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| format!("Could not create link preview cache: {error}"))?;
        cache.insert(url, preview.clone());
        let bytes = serde_json::to_vec(&cache).map_err(|error| error.to_string())?;
        std::fs::write(path, bytes).map_err(|error| format!("Could not store link preview metadata: {error}"))?;
    }
    Ok(preview)
}

#[tauri::command]
pub async fn get_link_preview(app: tauri::AppHandle, url: String) -> Result<LinkPreview, String> {
    tauri::async_runtime::spawn_blocking(move || get_preview_blocking(app, url))
        .await.map_err(|error| format!("The link preview worker stopped: {error}"))?
}
