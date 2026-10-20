import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft, BellOff, Bluetooth, Check, ChevronRight, ChevronUp, Coffee,
  Headphones, LockKeyhole, MicOff, Moon, Monitor, Radio,
  RefreshCw, Signal, Sun,
  Volume2, VolumeX, Wifi, X,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import {
  CONTROL_HEROES, DEMO_AUDIO_OUTPUTS, DEMO_BLUETOOTH_DEVICES,
  DEMO_WIFI_NETWORKS, QUICK_TOGGLES,
} from './controlsConfig';
import { invokeTauriStrict } from '../../utils/tauriBridge';

const ICONS = {
  wifi: Wifi,
  bluetooth: Bluetooth,
  hotspot: Radio,
  keepAwake: Coffee,
  micMute: MicOff,
  nightLight: Moon,
  dnd: BellOff,
};

const sheetMotion = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -18 },
  transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
};

function ToggleTile({ item, active, onToggle, disabled = false, detailOverride }) {
  const Icon = ICONS[item.icon];
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={active}
      className={`group flex min-h-[64px] items-center gap-2.5 rounded-2xl border px-3 text-left transition-[background,border-color,transform] duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${active ? 'border-white/20 bg-white/[0.09]' : 'border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.055]'}`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${active ? 'bg-white text-black' : 'bg-white/[0.07] text-white/55 group-hover:text-white/80'}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-semibold text-white/90">{item.label}</span>
        <span className="mt-0.5 block truncate text-[9px] text-white/40">{detailOverride || (active ? 'On' : item.detail)}</span>
      </span>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,.8)]' : 'bg-white/20'}`} />
    </button>
  );
}

function RangeControl({ label, value, onChange, onCommit, onInteractionStart, onInteractionEnd, icon: Icon, muted = false }) {
  return (
    <label className="flex min-w-0 items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-white/45" />
      <span className="sr-only">{label}</span>
      <input
        aria-label={label}
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerDown={onInteractionStart}
        onPointerUp={(event) => { onInteractionEnd?.(); onCommit?.(Number(event.currentTarget.value)); }}
        onKeyDown={onInteractionStart}
        onKeyUp={(event) => { onInteractionEnd?.(); onCommit?.(Number(event.currentTarget.value)); }}
        className="control-range min-w-0 flex-1"
      />
      <span className="w-8 shrink-0 text-right font-mono text-[10px] text-white/65">{muted ? 'Mute' : `${value}%`}</span>
    </label>
  );
}

function SheetHeader({ eyebrow, title, onBack, action }) {
  return (
    <div className="flex items-center gap-3 border-b border-white/[0.08] pb-3">
      <button type="button" onClick={onBack} aria-label="Back to controls" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/65 transition hover:bg-white/10 hover:text-white">
        <ArrowLeft className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/35">{eyebrow}</p>
        <h3 className="truncate text-sm font-semibold text-white">{title}</h3>
      </div>
      {action}
    </div>
  );
}

export default function ControlsTab({ onCollapse }) {
  const [sheet, setSheet] = useState(null);
  const [wifiOn] = useState(false);
  const [bluetoothOn] = useState(false);
  const [activeToggles, setActiveToggles] = useState({});
  const [brightness, setBrightness] = useState(80);
  const [volume, setVolume] = useState(64);
  const volumeRef = useRef(64);
  const [brightnessAvailable, setBrightnessAvailable] = useState(true);
  const brightnessReadSucceeded = useRef(false);
  const [microphoneAvailable, setMicrophoneAvailable] = useState(false);
  const [muted, setMuted] = useState(false);
  const brightnessDragging = useRef(false);
  const [wifiNetworks, setWifiNetworks] = useState(DEMO_WIFI_NETWORKS);
  const [selectedNetwork, setSelectedNetwork] = useState(null);
  const [password, setPassword] = useState('');
  const [scanning, setScanning] = useState(false);
  const [bluetoothDevices, setBluetoothDevices] = useState(DEMO_BLUETOOTH_DEVICES);
  const [connecting, setConnecting] = useState(false);
  const [controlError, setControlError] = useState('');
  const [busyControl, setBusyControl] = useState('');

  useEffect(() => {
    let active = true;
    const refreshBrightness = async () => {
      if (brightnessDragging.current) return;
      try {
        const value = await invokeTauriStrict('get_display_brightness');
        if (active) { brightnessReadSucceeded.current = true; setBrightness(value); setBrightnessAvailable(true); }
      } catch {
        if (active && !brightnessReadSucceeded.current) setBrightnessAvailable(false);
      }
    };
    refreshBrightness();
    const interval = setInterval(refreshBrightness, 2200);
    return () => { active = false; clearInterval(interval); };
  }, []);
  useEffect(() => {
    invokeTauriStrict('get_audio_control_state')
      .then((state) => {
        setVolume(state.volume);
        volumeRef.current = state.volume;
        setMuted(state.muted);
        setMicrophoneAvailable(state.microphone_available);
        setActiveToggles((current) => ({ ...current, micMute: state.microphone_muted }));
      })
      .catch((error) => setControlError(String(error?.message || error)));
  }, []);

  const visibleToggles = useMemo(() => QUICK_TOGGLES.filter((toggle) => toggle.enabled), []);
  const isOn = (id) => Boolean(activeToggles[id]);
  const runNativeControl = async (name, command, args) => {
    setBusyControl(name);
    setControlError('');
    try {
      return await invokeTauriStrict(command, args);
    } catch (error) {
      setControlError(String(error?.message || error));
      return undefined;
    } finally {
      setBusyControl('');
    }
  };
  const toggle = async (id) => {
    const enabled = !isOn(id);
    const command = id === 'keepAwake' ? 'set_keep_awake' : id === 'micMute' ? 'set_microphone_muted' : null;
    if (!command) return;
    const result = await runNativeControl(id, command, id === 'keepAwake' ? { enabled } : { muted: enabled });
    if (result !== undefined) setActiveToggles((current) => ({ ...current, [id]: result }));
  };
  const adjustVolume = async (next) => {
    const result = await runNativeControl('volume', 'set_master_volume', { value: next });
    if (result !== undefined) { setVolume(result); volumeRef.current = result; }
  };
  const commitBrightness = async (next) => {
    const result = await runNativeControl('brightness', 'set_display_brightness', { value: next });
    if (result !== undefined) { setBrightness(result); setBrightnessAvailable(true); }
  };
  const openWindowsSettings = (page) => runNativeControl('settings', 'open_windows_settings', { page });
  const toggleMute = async () => {
    const result = await runNativeControl('mute', 'set_audio_muted', { muted: !muted });
    if (result !== undefined) setMuted(result);
  };
  const scanNetworks = () => {
    setControlError('Wi-Fi scanning and connection are not wired to Windows yet.');
  };
  const connectToNetwork = () => {
    setControlError('Wi-Fi connection is not wired to Windows yet.');
  };
  const toggleDeviceConnection = () => setControlError('Bluetooth pairing and connection are not wired to Windows yet.');

  return (
    <div className="relative h-full min-h-0 overflow-hidden text-white">
      <AnimatePresence mode="wait" initial={false}>
        {!sheet ? (
          <motion.div key="control-deck" {...sheetMotion} className="flex h-full min-h-0 flex-col gap-3">
            <div className="grid grid-cols-3 gap-2">
              {CONTROL_HEROES.map((hero) => {
                const Icon = hero.id === 'wifi' ? Wifi : hero.id === 'bluetooth' ? Bluetooth : (muted ? VolumeX : Volume2);
                const enabled = hero.id === 'wifi' ? wifiOn : hero.id === 'bluetooth' ? bluetoothOn : !muted;
                const status = hero.id === 'wifi'
                  ? 'Windows integration pending'
                  : hero.id === 'bluetooth'
                    ? 'Windows integration pending'
                    : (muted ? 'Muted' : 'Default output');
                return (
                  <div key={hero.id} className={`flex min-w-0 items-center gap-2 rounded-2xl border px-2.5 py-2 transition-colors ${enabled ? 'border-white/[0.14] bg-white/[0.065]' : 'border-white/[0.07] bg-white/[0.025]'}`}>
                    <button type="button" aria-label={hero.id === 'audio' ? (muted ? 'Unmute system audio' : 'Mute system audio') : `Open ${hero.label} controls`} aria-pressed={hero.id === 'audio' ? muted : undefined} onClick={() => hero.id === 'wifi' ? setSheet('wifi') : hero.id === 'bluetooth' ? setSheet('bluetooth') : toggleMute()} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${enabled ? 'bg-white text-black' : 'bg-white/[0.06] text-white/45'}`}>
                      <Icon className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setSheet(hero.sheet)} className="flex min-w-0 flex-1 items-center justify-between gap-1 text-left">
                      <span className="min-w-0"><span className="block text-[11px] font-semibold text-white/90">{hero.label}</span><span className="mt-0.5 block truncate text-[9px] text-white/45">{status}</span></span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/35" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-4 gap-2">
              {visibleToggles.map((item) => <ToggleTile key={item.id} item={item} active={isOn(item.id)} onToggle={() => toggle(item.id)} disabled={!(item.id === 'keepAwake' || (item.id === 'micMute' && microphoneAvailable)) || busyControl === item.id} detailOverride={item.id === 'keepAwake' ? (isOn(item.id) ? 'Preventing sleep' : item.detail) : item.id === 'micMute' ? (microphoneAvailable ? (isOn(item.id) ? 'Microphone muted' : 'Microphone active') : 'No microphone endpoint') : 'Not connected yet'} />)}
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-2">
              <RangeControl label="Display brightness" value={brightness} onChange={setBrightness} onCommit={commitBrightness} onInteractionStart={() => { brightnessDragging.current = true; }} onInteractionEnd={() => { brightnessDragging.current = false; }} icon={Sun} />
              <RangeControl label="Master volume" value={volume} onChange={setVolume} onCommit={adjustVolume} icon={muted ? VolumeX : Volume2} muted={muted} />
            </div>
            {!brightnessAvailable && <p className="px-1 text-[9px] text-white/35">Brightness is unavailable on this display.</p>}
            {controlError && <p role="alert" className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-[10px] text-white/75">{controlError}</p>}

            <div className="flex min-h-[88px] flex-1 flex-col justify-center gap-3 rounded-2xl border border-white/[0.1] bg-white/[0.035] px-3 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.08] text-white/80"><Monitor className="h-4 w-4" /></div>
                <div className="min-w-0">
                  <h4 className="text-xs font-semibold text-white/90">Windows settings</h4>
                  <p className="text-[10px] text-white/40">Open full display and sound controls</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={busyControl === 'settings'} onClick={() => openWindowsSettings('display')} className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[10px] font-medium text-white/75 transition hover:bg-white/[0.09] hover:text-white disabled:opacity-40"><Sun className="h-3.5 w-3.5" />Display settings</button>
                <button type="button" disabled={busyControl === 'settings'} onClick={() => openWindowsSettings('sound')} className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[10px] font-medium text-white/75 transition hover:bg-white/[0.09] hover:text-white disabled:opacity-40"><Volume2 className="h-3.5 w-3.5" />Sound settings</button>
              </div>
            </div>

            <div className="flex justify-center">
              <button type="button" onClick={onCollapse} className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1 text-[10px] font-medium text-white/50 transition hover:bg-white/[0.08] hover:text-white/85"><ChevronUp className="h-3 w-3" />Minimize</button>
            </div>
          </motion.div>
        ) : (
          <motion.div key={`sheet-${sheet}`} {...sheetMotion} className="flex h-full min-h-0 flex-col gap-3">
            {sheet === 'wifi' && <>
              <SheetHeader eyebrow="Connections" title="Wi-Fi networks" onBack={() => { setSheet(null); setSelectedNetwork(null); }} action={<button type="button" onClick={scanNetworks} disabled={!wifiOn || scanning} aria-label="Scan for networks" className="rounded-full p-2 text-white/55 transition hover:bg-white/10 hover:text-white disabled:opacity-35"><RefreshCw className={`h-4 w-4 ${scanning ? 'animate-spin' : ''}`} /></button>} />
              <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2"><div><p className="text-[11px] font-medium">Wi-Fi adapter</p><p className="text-[9px] text-white/40">Windows integration pending</p></div><button type="button" disabled role="switch" aria-checked={wifiOn} className="h-6 w-11 cursor-not-allowed rounded-full bg-white/20 p-0.5 opacity-50"><span className="block h-5 w-5 rounded-full bg-white" /></button></div>
              <p className="text-[9px] text-white/35">Network names below are preview data; scanning and connecting are not active yet.</p>
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
                {wifiNetworks.map((network) => <button key={network.id} type="button" disabled className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left opacity-45 ${selectedNetwork?.id === network.id ? 'border-white/25 bg-white/[0.09]' : 'border-transparent bg-white/[0.025]'}`}>
                  <Wifi className={`h-4 w-4 shrink-0 ${network.connected ? 'text-white' : 'text-white/45'}`} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-medium">{network.name}</span><span className="mt-0.5 block text-[9px] text-white/40">{network.connected ? 'Connected · ' : ''}{network.secured ? 'Secured network' : 'Open network'}</span></span>
                  <span className="flex items-center gap-2 text-white/40">{network.secured && <LockKeyhole className="h-3 w-3" />}<Signal className="h-3.5 w-3.5" />{network.connected && <Check className="h-3.5 w-3.5 text-white" />}</span>
                </button>)}
                {scanning && <p className="py-1 text-center text-[9px] text-white/40">Searching for nearby networks…</p>}
              </div>
              {selectedNetwork && <div className="space-y-2 rounded-xl border border-white/[0.08] bg-white/[0.035] p-2.5">
                <div className="flex items-center justify-between"><span className="text-[10px] font-medium">Connect to {selectedNetwork.name}</span><button type="button" onClick={() => setSelectedNetwork(null)} aria-label="Close connect form" className="text-white/40 hover:text-white"><X className="h-3.5 w-3.5" /></button></div>
                {selectedNetwork.secured && <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Network password (8+ characters)" className="w-full rounded-lg border border-white/10 bg-black px-2.5 py-2 text-[10px] text-white outline-none placeholder:text-white/30 focus:border-white/35" />}
                <div className="flex justify-end"><button type="button" onClick={connectToNetwork} disabled={connecting || (selectedNetwork.secured && password.trim().length < 8)} className="rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold text-black transition hover:bg-white/85 disabled:opacity-35">{connecting ? 'Connecting…' : selectedNetwork.connected ? 'Reconnect' : 'Connect'}</button></div>
              </div>}
            </>}

            {sheet === 'bluetooth' && <>
              <SheetHeader eyebrow="Connections" title="Bluetooth devices" onBack={() => setSheet(null)} action={<button type="button" aria-label="Close Bluetooth details" onClick={() => setSheet(null)} className="rounded-full p-2 text-white/45 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>} />
              <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2"><div><p className="text-[11px] font-medium">Bluetooth</p><p className="text-[9px] text-white/40">Windows integration pending</p></div><button type="button" disabled role="switch" aria-checked={bluetoothOn} className="h-6 w-11 cursor-not-allowed rounded-full bg-white/20 p-0.5 opacity-50"><span className="block h-5 w-5 rounded-full bg-white" /></button></div>
              <p className="text-[9px] text-white/35">Devices below are preview data; discovery, pairing, and connection are not active yet.</p>
              <p className="px-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/35">Paired and nearby</p>
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
                {bluetoothDevices.map((device) => <div key={device.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${device.connected ? 'border-white/15 bg-white/[0.07]' : 'border-transparent bg-white/[0.025]'}`}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.07] text-white/60"><Headphones className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-medium">{device.name}</span><span className="block text-[9px] text-white/40">{device.connected ? 'Connected' : device.paired ? 'Paired' : 'Available'} · {device.kind}</span></span>
                  <button type="button" disabled onClick={() => toggleDeviceConnection(device.id)} className="rounded-full border border-white/10 px-2.5 py-1 text-[9px] font-medium text-white/75 opacity-40">{device.connected ? 'Disconnect' : device.paired ? 'Connect' : 'Pair'}</button>
                </div>)}
              </div>
              <p className="px-1 text-[9px] text-white/30">Demo device list · pairing is not connected to Windows yet</p>
            </>}

            {sheet === 'audio' && <>
              <SheetHeader eyebrow="Sound" title="Audio output" onBack={() => setSheet(null)} action={<button type="button" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'} className="rounded-full p-2 text-white/55 transition hover:bg-white/10 hover:text-white">{muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>} />
              <p className="text-[10px] text-white/45">Choose where system audio should play.</p>
              <div className="space-y-1">{DEMO_AUDIO_OUTPUTS.map((output) => <button key={output} type="button" disabled className="flex w-full items-center gap-3 rounded-xl border border-transparent bg-white/[0.025] px-3 py-3 text-left opacity-40"><Volume2 className="h-4 w-4 text-white/55" /><span className="flex-1 text-[11px] font-medium">{output}</span></button>)}</div>
              <RangeControl label="Master volume" value={volume} onChange={setVolume} onCommit={adjustVolume} icon={muted ? VolumeX : Volume2} muted={muted} />
              <p className="mt-auto px-1 text-[9px] text-white/30">Output names above are previews; routing is pending. Volume and mute control the Windows default output.</p>
            </>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}



