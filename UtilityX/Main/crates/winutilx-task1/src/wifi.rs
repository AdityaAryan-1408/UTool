use serde::Serialize;
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::ffi::c_void;
use std::ptr::null_mut;

#[repr(C)]
#[derive(Clone, Copy)]
struct Guid { data1: u32, data2: u16, data3: u16, data4: [u8; 8] }

#[repr(C)]
struct WlanInterfaceInfo { guid: Guid, description: [u16; 256], state: i32 }

#[repr(C)]
struct WlanInterfaceInfoList { count: u32, index: u32, interfaces: [WlanInterfaceInfo; 1] }

#[repr(C)]
#[derive(Clone, Copy)]
struct Dot11Ssid { length: u32, bytes: [u8; 32] }

#[repr(C)]
struct WlanAvailableNetwork {
    ssid: Dot11Ssid,
    bss_type: i32,
    bssid_count: u32,
    connectable: i32,
    not_connectable_reason: u32,
    phy_type_count: u32,
    phy_types: [i32; 8],
    more_phy_types: i32,
    signal_quality: u32,
    security_enabled: i32,
    auth_algorithm: i32,
    cipher_algorithm: i32,
    flags: u32,
    reserved: u32,
}

#[repr(C)]
struct WlanAvailableNetworkList { count: u32, index: u32, networks: [WlanAvailableNetwork; 1] }

#[repr(C)]
struct WlanAssociationAttributes {
    ssid: Dot11Ssid,
    bssid: [u8; 6],
    bss_type: i32,
    phy_type: i32,
    phy_index: u32,
    signal_quality: u32,
    rx_rate: u32,
    tx_rate: u32,
}

#[repr(C)]
struct WlanSecurityAttributes {
    security_enabled: i32,
    one_x_enabled: i32,
    auth_algorithm: i32,
    cipher_algorithm: i32,
}

#[repr(C)]
struct WlanConnectionAttributes {
    state: i32,
    mode: i32,
    profile_name: [u16; 256],
    association: WlanAssociationAttributes,
    security: WlanSecurityAttributes,
}

#[repr(C)]
struct WlanConnectionParameters {
    mode: u32,
    profile: *const u16,
    desired_ssid: *const c_void,
    desired_bssids: *const c_void,
    bss_type: u32,
    flags: u32,
}

#[link(name = "wlanapi")]
extern "system" {
    fn WlanOpenHandle(version: u32, reserved: *mut c_void, negotiated_version: *mut u32, client: *mut *mut c_void) -> u32;
    fn WlanCloseHandle(client: *mut c_void, reserved: *mut c_void) -> u32;
    fn WlanEnumInterfaces(client: *mut c_void, reserved: *mut c_void, list: *mut *mut WlanInterfaceInfoList) -> u32;
    fn WlanGetAvailableNetworkList(client: *mut c_void, interface: *const Guid, flags: u32, reserved: *mut c_void, list: *mut *mut WlanAvailableNetworkList) -> u32;
    fn WlanQueryInterface(client: *mut c_void, interface: *const Guid, opcode: u32, reserved: *mut c_void, data_size: *mut u32, data: *mut *mut c_void, value_type: *mut u32) -> u32;
    fn WlanFreeMemory(memory: *mut c_void);
    fn WlanSetProfile(client: *mut c_void, interface: *const Guid, flags: u32, profile_xml: *const u16, all_user_security: *const u16, overwrite: i32, reserved: *mut c_void, reason: *mut u32) -> u32;
    fn WlanConnect(client: *mut c_void, interface: *const Guid, params: *const WlanConnectionParameters, reserved: *mut c_void) -> u32;
}

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

unsafe fn open_wlan_interfaces() -> Result<(*mut c_void, *mut WlanInterfaceInfoList), String> {
    let mut negotiated_version = 0u32;
    let mut client = null_mut();
    let opened = WlanOpenHandle(2, null_mut(), &mut negotiated_version, &mut client);
    if opened != 0 { return Err(format!("Windows could not open Wi-Fi status (error {opened}).")); }
    let mut list = null_mut();
    let enumerated = WlanEnumInterfaces(client, null_mut(), &mut list);
    if enumerated != 0 {
        WlanCloseHandle(client, null_mut());
        return Err(format!("Windows could not enumerate Wi-Fi adapters (error {enumerated})."));
    }
    if list.is_null() {
        WlanCloseHandle(client, null_mut());
        return Err("Windows did not return a Wi-Fi adapter list.".into());
    }
    Ok((client, list))
}

fn ssid_text(ssid: &Dot11Ssid) -> Option<String> {
    let length = (ssid.length as usize).min(ssid.bytes.len());
    if length == 0 { return None; }
    Some(String::from_utf8_lossy(&ssid.bytes[..length]).into_owned())
}

fn read_status() -> Result<WifiStatus, String> {
    unsafe {
        const WLAN_INTF_OPCODE_CURRENT_CONNECTION: u32 = 7;
        const WLAN_INTERFACE_STATE_NOT_READY: i32 = 0;
        const WLAN_INTERFACE_STATE_CONNECTED: i32 = 1;
        const WLAN_INTERFACE_STATE_ADHOC_FORMED: i32 = 2;
        let (client, list) = open_wlan_interfaces()?;
        let count = (*list).count as usize;
        let interfaces = std::slice::from_raw_parts((*list).interfaces.as_ptr(), count);
        let mut enabled = false;
        let mut connected_ssid = None;
        for interface in interfaces {
            if interface.state != WLAN_INTERFACE_STATE_NOT_READY { enabled = true; }
            let mut data_size = 0u32;
            let mut data = null_mut();
            let mut value_type = 0u32;
            let result = WlanQueryInterface(client, &interface.guid, WLAN_INTF_OPCODE_CURRENT_CONNECTION, null_mut(), &mut data_size, &mut data, &mut value_type);
            if result == 0 && !data.is_null() {
                let connection = &*(data as *const WlanConnectionAttributes);
                if connection.state == WLAN_INTERFACE_STATE_CONNECTED || connection.state == WLAN_INTERFACE_STATE_ADHOC_FORMED {
                    connected_ssid = ssid_text(&connection.association.ssid);
                }
                WlanFreeMemory(data);
            }
        }
        WlanFreeMemory(list.cast());
        WlanCloseHandle(client, null_mut());
        let connected = connected_ssid.is_some();
        let state = if !enabled { "Unavailable" } else if connected { "Connected" } else { "Disconnected" }.to_string();
        Ok(WifiStatus { enabled, connected, ssid: connected_ssid, state })
    }
}

#[tauri::command]
pub fn wifi_get_status() -> Result<WifiStatus, String> {
    read_status()
}

#[tauri::command]
pub fn wifi_scan_networks() -> Result<Vec<WifiNetwork>, String> {
    unsafe {
        const WLAN_AVAILABLE_NETWORK_CONNECTED: u32 = 0x1;
        let (client, interfaces_list) = open_wlan_interfaces()?;
        let count = (*interfaces_list).count as usize;
        let interfaces = std::slice::from_raw_parts((*interfaces_list).interfaces.as_ptr(), count);
        let mut networks: Vec<WifiNetwork> = Vec::new();
        let mut successful_scan = false;
        let mut last_error = 0u32;
        for interface in interfaces {
            let mut available_list = null_mut();
            let result = WlanGetAvailableNetworkList(client, &interface.guid, 0, null_mut(), &mut available_list);
            if result != 0 { last_error = result; continue; }
            successful_scan = true;
            if available_list.is_null() { continue; }
            let available_count = (*available_list).count as usize;
            let available = std::slice::from_raw_parts((*available_list).networks.as_ptr(), available_count);
            for network in available {
                let Some(name) = ssid_text(&network.ssid) else { continue; };
                let connected = network.flags & WLAN_AVAILABLE_NETWORK_CONNECTED != 0;
                let signal = network.signal_quality.min(100) as u8;
                if let Some(existing) = networks.iter_mut().find(|item| item.name == name) {
                    existing.signal = existing.signal.max(signal);
                    existing.connected |= connected;
                    existing.secured |= network.security_enabled != 0;
                } else {
                    networks.push(WifiNetwork {
                        id: name.clone(),
                        name,
                        secured: network.security_enabled != 0,
                        signal,
                        connected,
                    });
                }
            }
            WlanFreeMemory(available_list.cast());
        }
        WlanFreeMemory(interfaces_list.cast());
        WlanCloseHandle(client, null_mut());
        if !successful_scan { return Err(format!("Windows could not scan for Wi-Fi networks (error {last_error}).")); }
        networks.sort_by(|a, b| b.connected.cmp(&a.connected).then_with(|| b.signal.cmp(&a.signal)).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
        Ok(networks)
    }
}

fn xml_escape(value: &str) -> String {
    value.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
        .replace('"', "&quot;").replace('\'', "&apos;")
}

fn add_wifi_profile_in_memory(profile: &str, profile_name: &str) -> Result<(), String> {
    const WLAN_PROFILE_USER: u32 = 0x2;
    const WLAN_CONNECTION_MODE_PROFILE: u32 = 0;
    const DOT11_BSS_TYPE_INFRASTRUCTURE: u32 = 1;
    let profile_wide: Vec<u16> = profile.encode_utf16().chain(Some(0)).collect();
    let name_wide: Vec<u16> = profile_name.encode_utf16().chain(Some(0)).collect();
    unsafe {
        let mut negotiated_version = 0u32;
        let mut client = null_mut();
        let opened = WlanOpenHandle(2, null_mut(), &mut negotiated_version, &mut client);
        if opened != 0 { return Err(format!("Windows could not open Wi-Fi configuration (error {opened}).")); }
        let mut list = null_mut();
        let enumerated = WlanEnumInterfaces(client, null_mut(), &mut list);
        if enumerated != 0 {
            WlanCloseHandle(client, null_mut());
            return Err(format!("Windows could not find a Wi-Fi adapter (error {enumerated})."));
        }
        if list.is_null() {
            WlanCloseHandle(client, null_mut());
            return Err("Windows did not return a Wi-Fi adapter list.".into());
        }
        let count = (*list).count as usize;
        let interfaces = std::slice::from_raw_parts((*list).interfaces.as_ptr(), count);
        let mut last_error = 0u32;
        for adapter in interfaces {
            let mut reason = 0u32;
            let set_result = WlanSetProfile(client, &adapter.guid, WLAN_PROFILE_USER, profile_wide.as_ptr(), null_mut(), 1, null_mut(), &mut reason);
            if set_result != 0 {
                last_error = set_result;
                continue;
            }
            let params = WlanConnectionParameters {
                mode: WLAN_CONNECTION_MODE_PROFILE,
                profile: name_wide.as_ptr(),
                desired_ssid: std::ptr::null(),
                desired_bssids: std::ptr::null(),
                bss_type: DOT11_BSS_TYPE_INFRASTRUCTURE,
                flags: 0,
            };
            let connected = WlanConnect(client, &adapter.guid, &params, null_mut());
            if connected == 0 {
                WlanFreeMemory(list.cast());
                WlanCloseHandle(client, null_mut());
                return Ok(());
            }
            last_error = connected;
        }
        WlanFreeMemory(list.cast());
        WlanCloseHandle(client, null_mut());
        if count == 0 { return Err("Windows could not find a Wi-Fi adapter.".into()); }
        Err(format!("Windows could not install or connect to this Wi-Fi profile (error {last_error})."))
    }
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
    add_wifi_profile_in_memory(&profile, &ssid)?;
    Ok(format!("Windows is connecting to {ssid}."))
}

#[tauri::command]
pub fn wifi_disconnect() -> Result<String, String> {
    netsh(&["wlan", "disconnect"])?;
    Ok("Disconnected from Wi-Fi.".into())
}
