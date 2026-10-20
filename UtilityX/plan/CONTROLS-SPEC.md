# UtilityX Controls Tab — Modular Architecture & Specification

## 1. Overview & Android-Style Design Philosophy

The **Controls Tab** in UtilityX takes inspiration from modern Android (Pixel / Material You) and OriginOS Quick Settings. Rather than opening slow, external Windows Settings pages, the entire control deck lives inside the compact top notch.

### Core Principles
1. **Self-Contained & Inline**: Deep configurations (like selecting a Wi-Fi SSID or pairing a Bluetooth device) open inside smooth, inline **sub-sheets** within the notch, not external OS windows.
2. **Modular & Composable**: Features are registered as decoupled modules. You can add, remove, or reorder any toggle, slider, or sub-sheet by changing a single configuration file.
3. **Universal Media (GSMTC)**: The "Now Playing" controller works natively with **YouTube audio/video playing in any browser** (Chrome, Edge, Firefox, Brave) as well as desktop media apps (Spotify, VLC, Apple Music).
4. **Lightweight & Event-Driven**: Conforms to Rule 1 and Rule 2—no continuous background polling when the notch or tab is collapsed.

---

## 2. Two-Level Navigation Architecture

The Controls tab operates with a two-state view model powered by fluid Framer Motion slide transitions:

```
┌─────────────────────────────────────────────────────────────┐
│                      CONTROLS TAB                           │
│                                                             │
│  State A: MAIN CONTROLS          State B: INLINE SUB-SHEET  │
│  ┌───────────────────────┐       ┌───────────────────────┐  │
│  │ [ 📶 Wi-Fi       > ]  │       │ ← Wi-Fi Networks  🔄  │  │
│  │ [ 🔵 Bluetooth    > ]  │ ──►  │ ● Home-5G (Connected) │  │
│  ├───────────────────────┤ (Tap) │ 🔒 Office_Guest       │  │
│  │ Modular Toggles Grid  │       │ 🔒 Mobile_Hotspot     │  │
│  │ Dual Sliders          │       └───────────────────────┘  │
│  │ Universal Media Card  │        (Connect inline or tap    │
│  └───────────────────────┘         ← to slide back)         │
└─────────────────────────────────────────────────────────────┘
```

### State A: The Main Control Deck
- **Top Hero Pills**: Wi-Fi and Bluetooth tiles.
  - Tapping the icon toggles On/Off instantly.
  - Tapping the body or chevron (`>`) smoothly slides into the detailed sub-sheet.
- **Quick-Toggle Grid**: Modular cards for 1-click toggles (Mobile Hotspot, Keep-Awake, Mic Mute, Night Light, DND).
- **Dual Sliders**: Tactile horizontal pill sliders for Brightness and Master Volume.
- **Universal Now Playing Card**: Displays the live track/video title, artist/channel, scrub bar, and transport controls.

### State B: Inline Sub-Sheets
- **Wi-Fi Scanner Sheet**:
  - Scanning indicator and refresh trigger.
  - Current network details (SSID, IP, signal bars, Disconnect button).
  - List of in-range SSIDs with lock badges.
  - Inline password input field and Connect action.
- **Bluetooth Device Sheet**:
  - Adapter switch (On/Off).
  - Paired peripherals with 1-click Connect / Disconnect.
  - Nearby discoverable devices list.
- **Audio Output Switcher Sheet**:
  - Lists all active Windows audio output endpoints (Speakers, Bluetooth Headphones, USB DAC, HDMI).
  - 1-click radio selection to immediately route system audio.

---

## 3. Modular Plugin Architecture

Every control element is isolated so features can be enabled, disabled, or rearranged without refactoring.

### 3.1 Frontend Modularity (Config-Driven Registry)

The UI renders dynamically from a centralized registry schema:

```javascript
// controlsConfig.js

export const MAIN_HERO_PILLS = [
  {
    id: 'wifi',
    label: 'Wi-Fi',
    icon: 'Wifi',
    hasSubSheet: true,
    subSheetKey: 'wifi',
    statusKey: 'wifi_status', // e.g. "Home-5G" or "Disconnected"
    enabled: true,
  },
  {
    id: 'bluetooth',
    label: 'Bluetooth',
    icon: 'Bluetooth',
    hasSubSheet: true,
    subSheetKey: 'bluetooth',
    statusKey: 'bluetooth_status', // e.g. "Sony WH-1000XM4"
    enabled: true,
  },
];

export const QUICK_TOGGLES = [
  {
    id: 'hotspot',
    label: 'Hotspot',
    subLabel: '5 GHz Direct',
    icon: 'Radio',
    action: 'toggle_hotspot',
    enabled: true,
  },
  {
    id: 'caffeine',
    label: 'Keep-Awake',
    subLabel: 'Prevent Sleep',
    icon: 'Coffee',
    action: 'toggle_keep_awake',
    enabled: true,
  },
  {
    id: 'mic_mute',
    label: 'Mic Mute',
    subLabel: 'Hardware Kill',
    icon: 'MicOff',
    action: 'toggle_mic_mute',
    enabled: true,
  },
  {
    id: 'night_light',
    label: 'Night Light',
    subLabel: 'Warm Display',
    icon: 'Moon',
    action: 'toggle_night_light',
    enabled: true,
  },
  {
    id: 'dnd',
    label: 'Do Not Disturb',
    subLabel: 'Silence Toasts',
    icon: 'BellOff',
    action: 'toggle_dnd',
    enabled: false, // Disabled by default, easily enabled
  },
];

export const SUB_SHEETS = {
  wifi: WifiSubSheet,
  bluetooth: BluetoothSubSheet,
  audio_output: AudioOutputSubSheet,
};
```

**Adding or removing a feature** is as simple as flipping `enabled: true / false` or appending a new object to `QUICK_TOGGLES`.

---

### 3.2 Backend Modularity (Rust Tauri Commands)

The native backend splits control features into dedicated, isolated modules:

```text
crates/winutilx-task1/src/
├── main.rs
└── controls/
    ├── mod.rs          // Dispatches Tauri commands
    ├── wifi.rs         // wlanapi.dll integration
    ├── bluetooth.rs    // WinRT Bluetooth device discovery
    ├── audio.rs        // WASAPI volume & endpoint switcher
    ├── media.rs        // Windows GSMTC listener (YouTube / Spotify)
    ├── power.rs        // SetThreadExecutionState (Caffeine) & Lock
    └── hotspot.rs      // WiFiDirect / HostedNetwork manager
```

---

## 4. Universal "Now Playing" Engine (YouTube Browser + Desktop Apps)

### 4.1 How It Works
Windows provides the **Global System Media Transport Controls (GSMTC)** API (`Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager`).

Any modern Chromium or Gecko browser (**Google Chrome, Microsoft Edge, Mozilla Firefox, Brave, Opera, Vivaldi**) automatically registers an active GSMTC session when playing audio or video, including **YouTube, YouTube Music, Netflix, SoundCloud, and Twitch**.

### 4.2 Features Supported
1. **Real-Time Metadata**:
   - **Track Title**: Video title (e.g. *"Lofi Hip Hop Radio - Beats to Relax/Study to"*).
   - **Artist / Channel**: Channel name (e.g. *"Lofi Girl"*).
   - **Thumbnail / Album Art**: High-resolution thumbnail streamed directly from the media session stream into the UI.
2. **Playback State & Controls**:
   - **Play / Pause** toggle.
   - **Next / Previous Track** (for YouTube playlists or queues).
   - **Timeline Position & Duration**: Current timestamp and scrub bar (when reported by the browser).
3. **Multi-Session Switching**:
   - If Spotify and a YouTube video are both playing, GSMTC identifies the primary active session and allows cycling between sessions.
4. **Graceful Idle State**:
   - When no media is playing, the card cleanly displays an ambient, minimal standby state or collapses into a single line to preserve vertical space.

---

## 5. Native Windows Integration Map

| Feature | Windows API / DLL | Function / Capability |
| :--- | :--- | :--- |
| **Wi-Fi Scanner & Connect** | `wlanapi.dll` | `WlanOpenHandle`, `WlanEnumInterfaces`, `WlanGetAvailableNetworkList`, `WlanConnect` |
| **Bluetooth Discovery** | `Windows.Devices.Bluetooth` (WinRT) | `BluetoothDevice.FromIdAsync`, `DeviceInformation.FindAllAsync` |
| **Audio Routing (Output Selector)** | `CoreAudio` / `IPolicyConfig` | Enumerate playback endpoints and set default console device |
| **Master Volume** | `WASAPI` / `IAudioEndpointVolume` | Master scalar volume (0.0–1.0) and mute state |
| **Keep-Awake (Caffeine)** | `kernel32.dll` | `SetThreadExecutionState(ES_CONTINUOUS \| ES_SYSTEM_REQUIRED \| ES_DISPLAY_REQUIRED)` |
| **Mobile Hotspot Toggle** | `Windows.Networking.NetworkOperators` | `NetworkOperatorTetheringManager` (turn Windows hotspot on/off) |
| **Universal Now Playing** | `Windows.Media.Control` (WinRT) | `GlobalSystemMediaTransportControlsSessionManager` (Chrome, Edge, Spotify, etc.) |
| **Hardware Mic Mute** | `WASAPI` / `IAudioEndpointVolume` | Mutes default capture endpoint |

---

## 6. Implementation Stages

1. **Stage 1: Frontend Skeleton & Sub-Sheet Transition**
   - Refactor `ControlsTab.jsx` to render from `controlsConfig.js`.
   - Implement `<AnimatePresence mode="wait">` for slide-in/slide-out of sub-sheets.
2. **Stage 2: Universal GSMTC Media Bridge**
   - Add WinRT `Windows.Media.Control` wrapper in Rust to stream active YouTube/browser playback to the UI.
3. **Stage 3: Native Wi-Fi & Bluetooth Sub-Sheets**
   - Connect `wlanapi.dll` and Bluetooth scanning commands to populate real network lists.
4. **Stage 4: Audio Endpoint Switcher & Hardware Toggles**
   - Connect WASAPI default endpoint selection and `SetThreadExecutionState`.
