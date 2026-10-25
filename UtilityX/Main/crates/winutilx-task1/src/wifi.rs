use serde::Serialize;
use std::os::windows::process::CommandExt;
use std::process::Command;

#[derive(Serialize)]
pub struct WifiStatus {
    enabled: bool,
    connected: bool,
    ssid: Option<String>,
    state: String,
}

#[derive(Serialize)]
pub struct WifiNetwork {
    id: String,
    name: String,
    secured: bool,
    signal: u8,
    connected: bool,
}

fn netsh(args: &[&str]) -> Result<String, String> {
    let output = Command::new("netsh.exe")
        .creation_flags(0x08000000)
        .args(args)
        .output()
        .map_err(|error| format!("Could not start the Windows Wi-Fi control: {error}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !output.status.success() {
        let details = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if details.is_empty() {
            if stdout.is_empty() { "Windows rejected the Wi-Fi request.".into() } else { stdout }
        } else { details });
    }
    Ok(stdout)
}

fn field_value(line: &str) -> Option<&str> {
    line.split_once(':').map(|(_, value)| value.trim())
}

fn read_status() -> Result<WifiStatus, String> {
    let output = netsh(&["wlan", "show", "interfaces"])?;
    let mut state = None;
    let mut ssid = None;
    for line in output.lines() {
        let key = line.split_once(':').map(|(key, _)| key.trim()).unwrap_or("");
        if key.eq_ignore_ascii_case("State") {
            state = field_value(line).map(str::to_owned);
        } else if key.eq_ignore_ascii_case("SSID") && !line.to_ascii_lowercase().contains("bssid") {
            ssid = field_value(line).filter(|value| !value.is_empty()).map(str::to_owned);
        }
    }
    let state = state.unwrap_or_else(|| "Unavailable".into());
    let connected = state.eq_ignore_ascii_case("connected");
    let enabled = !state.to_ascii_lowercase().contains("not available")
        && !state.to_ascii_lowercase().contains("hardware")
        && !state.to_ascii_lowercase().contains("disabled")
        && !output.to_ascii_lowercase().contains("no wireless interface")
        && !output.to_ascii_lowercase().contains("no interface on the system");
    Ok(WifiStatus { enabled, connected, ssid: if connected { ssid } else { None }, state })
}

#[tauri::command]
pub fn wifi_get_status() -> Result<WifiStatus, String> {
    read_status()
}

#[tauri::command]
pub fn wifi_scan_networks() -> Result<Vec<WifiNetwork>, String> {
    // `show networks` asks WLAN AutoConfig to refresh its nearby-network list.
    let output = netsh(&["wlan", "show", "networks", "mode=bssid"])?;
    let current = read_status().ok().and_then(|status| status.ssid);
    let mut networks: Vec<WifiNetwork> = Vec::new();
    for line in output.lines() {
        let key = line.split_once(':').map(|(key, _)| key.trim()).unwrap_or("");
        if key.starts_with("SSID ") {
            if let Some(name) = field_value(line).filter(|name| !name.is_empty()) {
                if !networks.iter().any(|network| network.name == name) {
                    networks.push(WifiNetwork {
                        id: name.to_owned(), name: name.to_owned(), secured: true,
                        signal: 0, connected: current.as_deref() == Some(name),
                    });
                }
            }
        } else if key.eq_ignore_ascii_case("Authentication") {
            if let Some(network) = networks.last_mut() {
                network.secured = !field_value(line).unwrap_or("").eq_ignore_ascii_case("Open");
            }
        } else if key.eq_ignore_ascii_case("Signal") {
            if let Some(network) = networks.last_mut() {
                let signal = field_value(line).unwrap_or("").trim_end_matches('%').parse::<u8>().unwrap_or(0);
                network.signal = network.signal.max(signal.min(100));
            }
        }
    }
    networks.sort_by(|a, b| b.connected.cmp(&a.connected).then_with(|| b.signal.cmp(&a.signal)).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(networks)
}

fn xml_escape(value: &str) -> String {
    value.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
        .replace('"', "&quot;").replace('\'', "&apos;")
}

#[tauri::command]
pub fn wifi_connect_network(ssid: String, password: Option<String>) -> Result<String, String> {
    if ssid.trim().is_empty() || ssid.len() > 32 || ssid.chars().any(char::is_control) {
        return Err("That Wi-Fi network name is not valid.".into());
    }
    let networks = wifi_scan_networks()?;
    let network = networks.iter().find(|network| network.name == ssid)
        .ok_or_else(|| "That network is no longer visible. Refresh the list and try again.".to_string())?;
    if network.connected { return Ok(format!("Already connected to {ssid}.")); }

    // First use an existing Windows profile; this avoids handling credentials
    // at all for networks the PC has connected to before.
    let profile_name = format!("name={ssid}");
    let saved = netsh(&["wlan", "connect", &profile_name]);
    if saved.is_ok() { return Ok(format!("Windows is connecting to {ssid}.")); }
    let password = password.unwrap_or_default();
    let profile = if network.secured {
        if password.is_empty() { return Err("Enter the Wi-Fi password, or connect once through Windows to save its profile.".into()); }
        if password.len() < 8 || password.len() > 63 || password.chars().any(char::is_control) {
            return Err("The password must contain 8 to 63 characters.".into());
        }
        format!("<?xml version=\"1.0\"?><WLANProfile xmlns=\"http://www.microsoft.com/networking/WLAN/profile/v1\"><name>{}</name><SSIDConfig><SSID><name>{}</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>manual</connectionMode><MSM><security><authEncryption><authentication>WPA2PSK</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption><sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>{}</keyMaterial></sharedKey></security></MSM></WLANProfile>", xml_escape(&ssid), xml_escape(&ssid), xml_escape(&password))
    } else {
        "<?xml version=\"1.0\"?><WLANProfile xmlns=\"http://www.microsoft.com/networking/WLAN/profile/v1\"><name>OPEN_NETWORK_PLACEHOLDER</name><SSIDConfig><SSID><name>OPEN_NETWORK_PLACEHOLDER</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>manual</connectionMode><MSM><security><authEncryption><authentication>open</authentication><encryption>none</encryption><useOneX>false</useOneX></authEncryption></security></MSM></WLANProfile>".replace("OPEN_NETWORK_PLACEHOLDER", &xml_escape(&ssid))
    };
    let path = std::env::temp_dir().join(format!("utilityx-wifi-{}.xml", std::process::id()));
    std::fs::write(&path, profile).map_err(|error| format!("Could not prepare a temporary Wi-Fi profile: {error}"))?;
    let path_arg = path.to_string_lossy().into_owned();
    let add = netsh(&["wlan", "add", "profile", &format!("filename={path_arg}"), "user=current"]);
    let _ = std::fs::remove_file(&path);
    add?;
    netsh(&["wlan", "connect", &profile_name])?;
    Ok(format!("Windows is connecting to {ssid}."))
}

#[tauri::command]
pub fn wifi_disconnect() -> Result<String, String> {
    netsh(&["wlan", "disconnect"])?;
    Ok("Disconnected from Wi-Fi.".into())
}
