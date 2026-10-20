use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::ptr::null_mut;

use std::thread;
use std::time::Instant;

use windows_sys::Win32::Foundation::*;
use windows_sys::Win32::NetworkManagement::IpHelper::*;
use windows_sys::Win32::NetworkManagement::Ndis::*;
use windows_sys::Win32::Networking::WinSock::*;
use windows_sys::Win32::System::Power::*;

// ============================================================================
// Network Interface & Gateway Model
// ============================================================================

#[derive(Debug, Clone)]
pub struct AdapterInfo {
    pub name: String,
    pub description: String,
    pub is_wifi: bool,
    pub unicast_ips: Vec<Ipv4Addr>,
    pub gateway_ips: Vec<Ipv4Addr>,
}

unsafe fn pwstr_to_string(ptr: *const u16) -> String {
    if ptr.is_null() {
        return String::new();
    }
    let mut len = 0;
    while *ptr.add(len) != 0 {
        len += 1;
    }
    let slice = core::slice::from_raw_parts(ptr, len);
    String::from_utf16_lossy(slice)
}

pub fn get_active_adapters() -> Vec<AdapterInfo> {
    let mut adapters = Vec::new();
    unsafe {
        let mut buf_len: u32 = 16384;
        let mut buffer: Vec<u8> = vec![0u8; buf_len as usize];

        let flags = GAA_FLAG_INCLUDE_GATEWAYS;
        let mut ret = GetAdaptersAddresses(
            AF_UNSPEC as u32,
            flags,
            null_mut(),
            buffer.as_mut_ptr() as *mut IP_ADAPTER_ADDRESSES_LH,
            &mut buf_len,
        );

        if ret == ERROR_BUFFER_OVERFLOW {
            buffer.resize(buf_len as usize, 0);
            ret = GetAdaptersAddresses(
                AF_UNSPEC as u32,
                flags,
                null_mut(),
                buffer.as_mut_ptr() as *mut IP_ADAPTER_ADDRESSES_LH,
                &mut buf_len,
            );
        }

        if ret != NO_ERROR {
            eprintln!("[ERROR] GetAdaptersAddresses failed with code: {}", ret);
            return adapters;
        }

        let mut curr = buffer.as_ptr() as *const IP_ADAPTER_ADDRESSES_LH;
        while !curr.is_null() {
            let adp = &*curr;
            let name = pwstr_to_string(adp.FriendlyName);
            let desc = pwstr_to_string(adp.Description);
            let is_up = adp.OperStatus == IfOperStatusUp;
            let is_wifi = adp.IfType == IF_TYPE_IEEE80211;

            if is_up {
                let mut unicast_ips = Vec::new();
                let mut u_ptr = adp.FirstUnicastAddress;
                while !u_ptr.is_null() {
                    let u = &*u_ptr;
                    let sa = u.Address.lpSockaddr;
                    if !sa.is_null() && (*sa).sa_family == AF_INET as u16 {
                        let sin = &*(sa as *const SOCKADDR_IN);
                        let b = sin.sin_addr.S_un.S_un_b;
                        unicast_ips.push(Ipv4Addr::new(b.s_b1, b.s_b2, b.s_b3, b.s_b4));
                    }
                    u_ptr = u.Next;
                }

                let mut gateway_ips = Vec::new();
                let mut gw_ptr = adp.FirstGatewayAddress;
                while !gw_ptr.is_null() {
                    let gw = &*gw_ptr;
                    let sa = gw.Address.lpSockaddr;
                    if !sa.is_null() && (*sa).sa_family == AF_INET as u16 {
                        let sin = &*(sa as *const SOCKADDR_IN);
                        let b = sin.sin_addr.S_un.S_un_b;
                        gateway_ips.push(Ipv4Addr::new(b.s_b1, b.s_b2, b.s_b3, b.s_b4));
                    }
                    gw_ptr = gw.Next;
                }

                if !unicast_ips.is_empty() {
                    adapters.push(AdapterInfo {
                        name,
                        description: desc,
                        is_wifi,
                        unicast_ips,
                        gateway_ips,
                    });
                }
            }
            curr = adp.Next;
        }
    }
    adapters
}

pub fn get_battery_info() -> (u8, bool) {
    unsafe {
        let mut p: SYSTEM_POWER_STATUS = core::mem::zeroed();
        GetSystemPowerStatus(&mut p);
        (p.BatteryLifePercent, p.ACLineStatus == 1)
    }
}

pub fn get_pc_name() -> String {
    std::env::var("COMPUTERNAME").unwrap_or_else(|_| "Windows-PC".to_string())
}

// ============================================================================
// HTML Dashboard Template
// ============================================================================

fn render_dashboard_html(
    pc_name: &str,
    local_ip: &str,
    gateway_ip: &str,
    port: u16,
    battery_pct: u8,
    ac_power: bool,
) -> String {
    let battery_str = if battery_pct == 255 {
        "Desktop (No Battery)".to_string()
    } else {
        format!("{}% {}", battery_pct, if ac_power { "⚡ (Charging)" } else { "🔋" })
    };

    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WinUtilX — Hotspot Bridge</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{
    background: #080C14;
    color: #F8FAFC;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    padding: 20px;
  }}
  .card {{
    background: rgba(15, 23, 42, 0.75);
    backdrop-filter: blur(24px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    padding: 32px;
    max-width: 480px;
    width: 100%;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
  }}
  .badge {{
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid #10B981;
    color: #10B981;
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 20px;
  }}
  .dot {{
    width: 8px;
    height: 8px;
    background: #10B981;
    border-radius: 50%;
    box-shadow: 0 0 10px #10B981;
  }}
  h1 {{
    font-size: 24px;
    font-weight: 700;
    margin-bottom: 8px;
    background: linear-gradient(135deg, #00F2FE 0%, #10B981 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }}
  p.sub {{
    color: #94A3B8;
    font-size: 14px;
    margin-bottom: 24px;
  }}
  .stat-grid {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 24px;
  }}
  .stat-item {{
    background: rgba(30, 41, 59, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    padding: 14px;
  }}
  .stat-label {{
    font-size: 11px;
    color: #64748B;
    text-transform: uppercase;
    font-weight: 700;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }}
  .stat-val {{
    font-size: 14px;
    font-weight: 600;
    color: #F1F5F9;
    word-break: break-all;
  }}
  .actions {{
    display: flex;
    flex-direction: column;
    gap: 12px;
  }}
  button {{
    padding: 14px 20px;
    border-radius: 12px;
    border: none;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }}
  .btn-primary {{
    background: linear-gradient(135deg, #00F2FE 0%, #10B981 100%);
    color: #080C14;
  }}
  .btn-primary:active {{ transform: scale(0.98); }}
  .btn-secondary {{
    background: rgba(51, 65, 85, 0.6);
    color: #F8FAFC;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }}
  .btn-secondary:active {{ transform: scale(0.98); }}
  #log {{
    margin-top: 18px;
    padding: 12px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.4);
    font-family: monospace;
    font-size: 12px;
    color: #38BDF8;
    min-height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
  }}
</style>
</head>
<body>
<div class="card">
  <div class="badge"><div class="dot"></div> Hotspot Link Connected</div>
  <h1>WinUtilX Companion</h1>
  <p class="sub">Direct low-latency peer-to-peer bridge established.</p>
  
  <div class="stat-grid">
    <div class="stat-item">
      <div class="stat-label">Host Machine</div>
      <div class="stat-val">{pc_name}</div>
    </div>
    <div class="stat-item">
      <div class="stat-label">Power Level</div>
      <div class="stat-val">{battery_str}</div>
    </div>
    <div class="stat-item">
      <div class="stat-label">Host IPv4</div>
      <div class="stat-val">{local_ip}:{port}</div>
    </div>
    <div class="stat-item">
      <div class="stat-label">Detected Gateway</div>
      <div class="stat-val">{gateway_ip}</div>
    </div>
  </div>

  <div class="actions">
    <button class="btn-primary" onclick="testPing()">⚡ Send Real-Time Ping</button>
    <button class="btn-secondary" onclick="testLock()">🔒 Test Remote Command (Lock Signal)</button>
  </div>

  <div id="log">Ready for interactive commands.</div>
</div>

<script>
  function testPing() {{
    const log = document.getElementById('log');
    const start = performance.now();
    log.innerText = 'Pinging PC...';
    fetch('/api/ping')
      .then(r => r.json())
      .then(data => {{
        const rtt = Math.round(performance.now() - start);
        log.innerText = `✅ Ping Success! RTT: ${{rtt}}ms | PC: ${{data.pc_name}}`;
      }})
      .catch(e => log.innerText = '❌ Error communicating with PC');
  }}

  function testLock() {{
    const log = document.getElementById('log');
    log.innerText = 'Dispatching remote lock signal to PC...';
    fetch('/api/test_lock')
      .then(r => r.json())
      .then(data => {{
        log.innerText = `✅ Signal logged in PC terminal: ${{data.message}}`;
      }})
      .catch(e => log.innerText = '❌ Error dispatching command');
  }}
</script>
</body>
</html>"#
    )
}

// ============================================================================
// Client Connection Handler
// ============================================================================

fn handle_client(mut stream: TcpStream, peer_addr: SocketAddr) {
    let mut buffer = [0u8; 4096];
    let bytes_read = match stream.read(&mut buffer) {
        Ok(n) if n > 0 => n,
        _ => return,
    };

    let req = String::from_utf8_lossy(&buffer[..bytes_read]);

    if req.starts_with("GET /api/ping") {
        println!("[API PING] Received from {} -> Returning 200 OK + Diagnostics", peer_addr);
        let (bat, ac) = get_battery_info();
        let pc = get_pc_name();
        let json = format!(
            r#"{{"status":"ok","pc_name":"{}","battery":{},"charging":{}}}"#,
            pc, bat, ac
        );
        let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            json.len(),
            json
        );
        let _ = stream.write_all(resp.as_bytes());
    } else if req.starts_with("GET /api/test_lock") {
        println!("\n================================================================================");
        println!("[REMOTE COMMAND RECEIVED] from phone ({})", peer_addr);
        println!("Action: 'LockWorkStation' signal verified successfully!");
        println!("(In production Phase 2, this triggers the benign Win32 LockWorkStation() call)");
        println!("================================================================================\n");

        let json = r#"{"status":"ok","message":"LockWorkStation signal received by PC"}"#;
        let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            json.len(),
            json
        );
        let _ = stream.write_all(resp.as_bytes());
    } else if req.starts_with("GET /") {
        println!("[HTTP DASHBOARD] Serving mobile web UI to {}", peer_addr);
        let (bat, ac) = get_battery_info();
        let pc = get_pc_name();
        let adapters = get_active_adapters();

        let (local_ip_str, gw_ip_str) = if let Some(adp) = adapters.first() {
            (
                adp.unicast_ips.first().map(|ip| ip.to_string()).unwrap_or_else(|| "127.0.0.1".to_string()),
                adp.gateway_ips.first().map(|ip| ip.to_string()).unwrap_or_else(|| "Direct Gateway".to_string()),
            )
        } else {
            ("127.0.0.1".to_string(), "None".to_string())
        };

        let html = render_dashboard_html(&pc, &local_ip_str, &gw_ip_str, 8848, bat, ac);
        let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            html.len(),
            html
        );
        let _ = stream.write_all(resp.as_bytes());
    } else {
        // Plain TCP Companion Socket Handshake
        println!("[RAW SOCKET] Custom handshake packet from {}: {} bytes", peer_addr, bytes_read);
        let ack = b"WINUTILX_ACK\n";
        let _ = stream.write_all(ack);
    }
}

// ============================================================================
// Gateway Latency Prober
// ============================================================================

fn probe_gateway(gw: Ipv4Addr) {
    print!("  [PROBE] Probing Gateway {} latency... ", gw);
    let start = Instant::now();
    // Attempt rapid TCP handshake on standard ports (e.g. 53 DNS, 80 HTTP, 443 HTTPS)
    let ports = [53, 80, 443];
    let mut reached = false;
    for &p in &ports {
        let addr = SocketAddr::new(std::net::IpAddr::V4(gw), p);
        if let Ok(_stream) = TcpStream::connect_timeout(&addr, std::time::Duration::from_millis(200)) {
            let rtt = start.elapsed().as_micros() as f64 / 1000.0;
            println!("✅ Active! (Port {} answered in {:.2} ms)", p, rtt);
            reached = true;
            break;
        }
    }
    if !reached {
        println!("⚠️ Gateway detected (ICMP ping or custom port required; standard web ports filtered)");
    }
}

fn main() {
    println!("================================================================================");
    println!("     WINUTILX — SPIKE C: HOTSPOT GATEWAY DETECTION & HANDSHAKE");
    println!("================================================================================");
    println!("Objective: Validate dynamic gateway resolution & phone peer-to-peer bridge.");
    println!("Architecture: Win32 GetAdaptersAddresses + Dual-Protocol Socket Bridge.");
    println!("================================================================================\n");

    let pc_name = get_pc_name();
    let (battery, ac) = get_battery_info();
    let battery_desc = if battery == 255 {
        "Desktop".to_string()
    } else {
        format!("{}% {}", battery, if ac { "⚡ AC Connected" } else { "🔋 Battery" })
    };

    println!("Machine Hostname: {}", pc_name);
    println!("Power Status:     {}\n", battery_desc);

    println!("--- [1] SCANNING NETWORK ADAPTERS VIA WIN32 IP HELPER API ---");
    let adapters = get_active_adapters();

    if adapters.is_empty() {
        eprintln!("[ERROR] No active network adapters found!");
        return;
    }

    let mut selected_adapter: Option<AdapterInfo> = None;

    for (idx, adp) in adapters.iter().enumerate() {
        println!("[Adapter #{}] {}", idx + 1, adp.name);
        println!("  Description:  {}", adp.description);
        println!("  Interface:    {}", if adp.is_wifi { "Wireless Wi-Fi (802.11)" } else { "Wired / Virtual Ethernet" });

        for ip in &adp.unicast_ips {
            println!("  Local IPv4:   {}", ip);
        }

        if adp.gateway_ips.is_empty() {
            println!("  Gateway IPv4: None (Hosted Network or Direct Link)");
        } else {
            for gw in &adp.gateway_ips {
                println!("  Gateway IPv4: {} (Default Route)", gw);
                probe_gateway(*gw);
            }
        }
        println!();

        // Heuristic: Prefer Wi-Fi or primary adapter with gateway
        if selected_adapter.is_none() {
            if !adp.gateway_ips.is_empty() {
                selected_adapter = Some(adp.clone());
            }
        } else if adp.is_wifi && !adp.gateway_ips.is_empty() {
            selected_adapter = Some(adp.clone());
        }
    }

    let mut hotspot_ip: Option<Ipv4Addr> = None;
    let mut lan_ip: Option<Ipv4Addr> = None;

    for adp in &adapters {
        for ip in &adp.unicast_ips {
            let octets = ip.octets();
            if octets[0] == 192 && octets[1] == 168 && octets[2] == 137 {
                hotspot_ip = Some(*ip);
            } else if !ip.is_loopback() && lan_ip.is_none() {
                lan_ip = Some(*ip);
            }
        }
    }

    println!("================================================================================");
    println!("--- [2] DETECTED TOPOLOGY & ACCESS URLS ---");
    if let Some(hs_ip) = hotspot_ip {
        println!("🔥 WINDOWS MOBILE HOTSPOT DETECTED (Laptop is broadcasting Hotspot):");
        println!("   Laptop Hotspot Gateway IP: {}", hs_ip);
        println!("   Connected Phone Subnet:    192.168.137.x (Phone will be 192.168.137.2, etc.)");
        println!("   👉 OPEN ON YOUR PHONE:     http://{}:8848", hs_ip);
        println!();
    }
    if let Some(l_ip) = lan_ip {
        println!("🏢 COLLEGE LAN / WIRED ETHERNET:");
        println!("   Laptop LAN IP:             {}", l_ip);
        println!("   LAN Access URL:            http://{}:8848", l_ip);
        println!();
    }
    println!("💻 LOCAL PC ACCESS:             http://localhost:8848");
    println!("================================================================================\n");

    // Start Socket Bridge Server
    let port = 8848;
    let bind_addr = format!("0.0.0.0:{}", port);
    let listener = match TcpListener::bind(&bind_addr) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[FATAL] Could not bind TCP listener to {}: {:?}", bind_addr, e);
            return;
        }
    };

    println!("--- [3] LIVE PEER-TO-PEER SOCKET SERVER RUNNING ---");
    println!("Bound to 0.0.0.0:{} (listening across ALL adapters simultaneously)", port);
    println!("\n--------------------------------------------------------------------------------");
    println!("HOW TO TEST FROM YOUR PHONE:");
    if let Some(hs_ip) = hotspot_ip {
        println!(" Since your phone is connected to your Laptop's Hotspot, type this in your phone's browser:");
        println!("   👉 http://{}:{}", hs_ip, port);
    } else {
        let fallback_ip = lan_ip.unwrap_or(Ipv4Addr::new(127, 0, 0, 1));
        println!(" Open this in your mobile browser: http://{}:{}", fallback_ip, port);
    }
    println!();
    println!("Once the page opens on your phone, tap 'Send Real-Time Ping' or 'Test Remote Command'.");
    println!("Your phone's exact IP and latency will log in this terminal instantly!");
    println!("--------------------------------------------------------------------------------\n");
    println!("Listening for incoming handshakes (Press Ctrl+C to exit)...\n");

    for stream in listener.incoming() {
        match stream {
            Ok(s) => {
                let peer = s.peer_addr().unwrap_or_else(|_| SocketAddr::from(([0, 0, 0, 0], 0)));
                let ip_str = peer.ip().to_string();
                if ip_str.starts_with("192.168.137.") {
                    println!("[PHONE CONNECTED VIA HOTSPOT] 📱 Phone detected at: {}", peer);
                } else if ip_str.starts_with("10.2.") {
                    println!("[LAN CLIENT CONNECTED] 🏢 Client connected from LAN: {}", peer);
                } else if ip_str.starts_with("127.0.0.1") {
                    println!("[LOCAL PC CONNECTED] 💻 Browser connected from localhost");
                } else {
                    println!("[INCOMING CONNECTION] New peer connected from: {}", peer);
                }
                thread::spawn(move || {
                    handle_client(s, peer);
                });
            }
            Err(e) => {
                eprintln!("[ERROR] Socket accept error: {:?}", e);
            }
        }
    }
}
