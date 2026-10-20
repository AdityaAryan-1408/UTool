export const CONTROL_HEROES = [
  { id: 'wifi', label: 'Wi-Fi', icon: 'wifi', detail: 'Home-5G', sheet: 'wifi' },
  { id: 'bluetooth', label: 'Bluetooth', icon: 'bluetooth', detail: 'Sony WH-1000XM4', sheet: 'bluetooth' },
  { id: 'audio', label: 'Audio', icon: 'audio', detail: 'Speakers', sheet: 'audio' },
];

export const QUICK_TOGGLES = [
  { id: 'hotspot', label: 'Hotspot', detail: '5 GHz Direct', icon: 'hotspot', enabled: true },
  { id: 'keepAwake', label: 'Keep-Awake', detail: 'Prevent sleep', icon: 'keepAwake', enabled: true },
  { id: 'micMute', label: 'Mic mute', detail: 'Microphone', icon: 'micMute', enabled: true },
  { id: 'nightLight', label: 'Night light', detail: 'Eye comfort', icon: 'nightLight', enabled: true },
  { id: 'dnd', label: 'Do not disturb', detail: 'Silence alerts', icon: 'dnd', enabled: false },
];

export const DEMO_WIFI_NETWORKS = [
  { id: 'home', name: 'Home-5G', secured: true, signal: 92, connected: true },
  { id: 'office', name: 'Office_Guest', secured: true, signal: 68 },
  { id: 'direct', name: 'Mobile_Hotspot', secured: false, signal: 46 },
];

export const DEMO_BLUETOOTH_DEVICES = [
  { id: 'headphones', name: 'Sony WH-1000XM4', kind: 'Headphones', paired: true, connected: true },
  { id: 'mouse', name: 'MX Master 3S', kind: 'Mouse', paired: true, connected: false },
  { id: 'speaker', name: 'Soundcore Mini', kind: 'Speaker', paired: false, connected: false },
];

export const DEMO_AUDIO_OUTPUTS = ['Speakers', 'Bluetooth headphones', 'USB audio', 'HDMI display'];

