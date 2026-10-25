export const CONTROL_HEROES = [
  { id: 'wifi', label: 'Wi-Fi', icon: 'wifi', detail: 'Windows Wi-Fi', sheet: 'wifi' },
  { id: 'bluetooth', label: 'Bluetooth', icon: 'bluetooth', detail: 'Windows Bluetooth', sheet: 'bluetooth' },
  { id: 'audio', label: 'Audio', icon: 'audio', detail: 'System output', sheet: 'audio' },
];

// Only expose quick controls that are connected to real Windows APIs.
export const QUICK_TOGGLES = [
  { id: 'keepAwake', label: 'Keep-Awake', detail: 'Prevent sleep', icon: 'keepAwake', enabled: true },
  { id: 'micMute', label: 'Mic mute', detail: 'Microphone', icon: 'micMute', enabled: true },
];
