import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUpRight, BatteryMedium, Check, Clock3, Keyboard, KeyRound, Monitor,
  Palette, RotateCcw, Settings2, SlidersHorizontal, UserRound, Wifi, X,
} from 'lucide-react';
import { getNotchGreeting } from '../utils/notchGreeting';
import { invokeTauriStrict } from '../utils/tauriBridge';

const HOVER_OPTIONS = [
  { id: 'cpu', label: 'Processor', detail: 'Current CPU load', sample: 'CPU 8%', icon: Settings2 },
  { id: 'memory', label: 'Memory', detail: 'Used system memory', sample: 'MEM 5.2 GB', icon: Monitor },
  { id: 'battery', label: 'Battery', detail: 'Charge and power state', sample: 'BAT 98%', icon: BatteryMedium },
  { id: 'network', label: 'Network', detail: 'Connected network', sample: 'WI-FI', icon: Wifi },
  { id: 'clock', label: 'Local time', detail: 'A small glance at the time', sample: '10:42', icon: Clock3 },
];

const THEMES = [
  { id: 'neon', label: 'Neon white', color: '#F5F7FF', note: 'AMOLED black with a white glow' },
];

const SECTIONS = [
  { id: 'hover', label: 'Hover card', icon: SlidersHorizontal, title: 'Hover card', desc: 'Choose what appears beside the notch.' },
  { id: 'appearance', label: 'Appearance', icon: Palette, title: 'Appearance', desc: 'Pure black surfaces with a restrained white highlight.' },
  { id: 'behavior', label: 'Behavior', icon: Monitor, title: 'Behavior', desc: 'Set how WinUtilX behaves around your work.' },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard, title: 'Shortcuts', desc: 'Quick access without reaching for the mouse.' },
  { id: 'profile', label: 'Greeting', icon: UserRound, title: 'Your greeting', desc: 'Choose the name shown in your notch greeting.' },
  { id: 'ai', label: 'AI & API Keys', icon: KeyRound, title: 'AI & API Keys', desc: 'Configure the provider used by Circle Search.' },
];

function ToggleRow({ title, description, value, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={value} onClick={() => onChange(!value)} className="flex w-full items-center justify-between gap-4 border-b border-white/[0.06] py-3.5 text-left">
      <span>
        <span className="block text-[12px] font-medium text-[#E8E9E3]">{title}</span>
        <span className="mt-1 block text-[10px] leading-4 text-[#8F9690]">{description}</span>
      </span>
      <span className={`w-9 h-5 shrink-0 rounded-full p-0.5 transition-colors ${value ? 'bg-[#F5F7FF]' : 'bg-[#2A2A2A]'}`}>
        <span className={`block h-4 w-4 rounded-full bg-[#000000] shadow-sm transition-transform ${value ? 'translate-x-4' : ''}`} />
      </span>
    </button>
  );
}

export default function SettingsModal({
  isOpen,
  onClose,
  accent,
  theme = 'neon',
  onThemeChange = () => {},
  hoverDetails = ['cpu', 'memory'],
  onHoverDetailsChange = () => {},
  displayName = 'Aditya',
  onDisplayNameChange = () => {},
  onReset = () => {},
  initialSection = 'hover',
}) {
  const [section, setSection] = useState('hover');
  const [autohide, setAutohide] = useState(true);
  const [startup, setStartup] = useState(true);
  const [sounds, setSounds] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [apiConfigured, setApiConfigured] = useState(false);
  const [apiBusy, setApiBusy] = useState(false);
  const [apiMessage, setApiMessage] = useState('');
  const selected = Array.isArray(hoverDetails) ? hoverDetails : ['cpu', 'memory'];
  const sectionInfo = SECTIONS.find((item) => item.id === section) || SECTIONS[0];
  const activeColor = THEMES.find((item) => item.id === theme)?.color || '#F5F7FF';
  const greetingPreview = getNotchGreeting(displayName.trim() || 'Aditya');

  useEffect(() => {
    if (!isOpen) return;
    setSection(initialSection || 'hover');
  }, [isOpen, initialSection]);

  useEffect(() => {
    if (!isOpen || section !== 'ai') return;
    invokeTauriStrict('ai_key_status').then(setApiConfigured).catch((error) => setApiMessage(String(error?.message || error)));
  }, [isOpen, section]);

  const saveApiKey = async () => {
    setApiBusy(true); setApiMessage('');
    try {
      await invokeTauriStrict('ai_save_key', { apiKey: apiKey.trim() });
      setApiConfigured(true); setApiKey(''); setApiMessage('Saved encrypted on this PC.');
    } catch (error) { setApiMessage(String(error?.message || error)); }
    finally { setApiBusy(false); }
  };

  const testApiKey = async () => {
    setApiBusy(true); setApiMessage('Testing Groq connection…');
    try {
      const message = await invokeTauriStrict('ai_test_key', { apiKey: apiKey.trim() || null });
      setApiMessage(message);
    } catch (error) { setApiMessage(String(error?.message || error)); }
    finally { setApiBusy(false); }
  };

  const removeApiKey = async () => {
    setApiBusy(true); setApiMessage('');
    try {
      await invokeTauriStrict('ai_delete_key');
      setApiConfigured(false); setApiKey(''); setApiMessage('Saved Groq key removed.');
    } catch (error) { setApiMessage(String(error?.message || error)); }
    finally { setApiBusy(false); }
  };

  const toggleMetric = (id) => onHoverDetailsChange((current) => {
    const list = Array.isArray(current) ? current : ['cpu', 'memory'];
    if (list.includes(id)) return list.filter((item) => item !== id);
    return list.length < 3 ? [...list, id] : list;
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="settings"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          className="fixed inset-0 z-[80] flex items-start justify-center bg-black/30 px-3 pt-3 backdrop-blur-[2px] pointer-events-auto"
        >
          <motion.section
            initial={{ opacity: 0, y: 8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
            style={{ width: 'min(760px, calc(100vw - 24px))', height: 'min(454px, calc(100vh - 24px))' }}
            className="grid grid-cols-[158px_minmax(0,1fr)] overflow-hidden rounded-[22px] border border-white/[0.09] bg-[#000000] text-[#E8E9E3] shadow-[0_18px_60px_rgba(0,0,0,0.3)]"
          >
            <aside className="flex min-h-0 flex-col border-r border-white/[0.07] bg-[#050505] p-3">
              <div className="flex items-center gap-2.5 px-1 py-1">
                <span className="flex h-8 w-8 items-center justify-center rounded-[11px] border border-white/[0.08] bg-white/[0.04]">
                  <Settings2 className="h-4 w-4" style={{ color: activeColor }} />
                </span>
                <span>
                  <span className="block text-[12px] font-semibold tracking-[-0.02em] text-[#F0F1EB]">Preferences</span>
                  <span className="mt-0.5 block text-[10px] text-[#858C86]">WinUtilX</span>
                </span>
              </div>

              <nav className="mt-7 space-y-1">
                {SECTIONS.map((item) => {
                  const Icon = item.icon;
                  const active = section === item.id;
                  return (
                    <button key={item.id} type="button" onClick={() => setSection(item.id)} className={`flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[11px] font-medium transition-colors ${active ? 'bg-white/[0.07] text-[#F1F2EC]' : 'text-[#929A93] hover:bg-white/[0.035] hover:text-[#DDE0D9]'}`}>
                      <Icon className="h-3.5 w-3.5" style={active ? { color: activeColor } : undefined} />
                      {item.label}
                    </button>
                  );
                })}
              </nav>

              <div className="mt-auto space-y-3 border-t border-white/[0.07] pt-3">
                <p className="px-1 text-[9px] leading-4 text-[#737B74]">Changes save as you make them.</p>
                <button type="button" onClick={() => { setAutohide(true); setStartup(true); setSounds(false); onReset(); }} className="flex items-center gap-2 px-1 text-[10px] font-medium text-[#9AA199] transition-colors hover:text-[#E3E6DE]">
                  <RotateCcw className="h-3 w-3" />Reset preferences
                </button>
              </div>
            </aside>

            <div className="flex min-h-0 flex-col bg-[#000000]">
              <header className="flex items-start justify-between border-b border-white/[0.07] px-5 py-3.5">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#8D958D]">Personalize</p>
                  <h2 className="mt-1 text-[16px] font-semibold tracking-[-0.035em] text-[#F1F2EC]">{sectionInfo.title}</h2>
                  <p className="mt-1 text-[10px] text-[#929A93]">{sectionInfo.desc}</p>
                </div>
                <button type="button" onClick={onClose} className="flex h-8 items-center gap-2 rounded-[10px] border border-white/[0.08] bg-white/[0.035] px-2.5 text-[10px] font-medium text-[#AFB5AD] transition-colors hover:bg-white/[0.08] hover:text-white">
                  Done <X className="h-3.5 w-3.5" />
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3.5">
                {section === 'hover' && (
                  <motion.div key="hover" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-medium text-[#E3E6DF]">Quick readouts</p>
                        <p className="mt-1 text-[9px] text-[#899189]">Choose up to three details for the hover state.</p>
                      </div>
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-2 py-1 text-[9px] text-[#A4ACA3]">{selected.length} / 3</span>
                    </div>

                    <div className="mt-2.5 flex h-10 items-center justify-center rounded-[12px] border border-white/[0.08] bg-[#060606]">
                      <div className="flex h-8 items-center gap-2 rounded-full border border-white/[0.08] bg-[#0C0C0C] px-3">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: activeColor }} />
                        <span className="text-[10px] font-semibold text-[#E7E9E2]">WinUtilX</span>
                        <span className="mx-0.5 h-3 w-px bg-white/[0.12]" />
                        {selected.length ? selected.map((id) => {
                          const item = HOVER_OPTIONS.find((option) => option.id === id);
                          return item ? <span key={id} className="text-[9px] text-[#A4ACA3]">{item.sample}</span> : null;
                        }) : <span className="text-[9px] text-[#7F877F]">No details</span>}
                        <ArrowUpRight className="h-3 w-3" style={{ color: activeColor }} />
                      </div>
                    </div>

                    <div className="mt-2.5 grid grid-cols-1 gap-2">
                      {HOVER_OPTIONS.map((item) => {
                        const Icon = item.icon;
                        const active = selected.includes(item.id);
                        const locked = !active && selected.length >= 3;
                        return (
                          <button key={item.id} type="button" disabled={locked} aria-pressed={active} onClick={() => toggleMetric(item.id)} className={`flex min-h-[51px] items-center gap-2 rounded-[11px] border px-2.5 py-1.5 text-left transition-all ${active ? 'border-white/[0.13] bg-white/[0.055]' : 'border-white/[0.06] bg-white/[0.018] hover:bg-white/[0.045]'}${locked ? ' cursor-not-allowed opacity-40' : ''}`}>
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-white/[0.045]"><Icon className="h-3.5 w-3.5" style={{ color: active ? activeColor : '#919990' }} /></span>
                            <span className="min-w-0 flex-1"><span className="block text-[10px] font-medium text-[#DEE1DA]">{item.label}</span><span className="mt-0.5 block text-[9px] text-[#828A82]">{item.detail}</span></span>
                            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${active ? 'border-transparent' : 'border-white/[0.16]'}`} style={active ? { backgroundColor: activeColor } : undefined}>{active && <Check className="h-2.5 w-2.5 text-[#000000]" />}</span>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}

                {section === 'appearance' && (
                  <motion.div key="appearance" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
                    <p className="text-[11px] font-medium text-[#E3E6DF]">Accent color</p>
                    <p className="mt-1 text-[9px] text-[#899189]">Applied to active controls and small status details.</p>
                    <div className="mt-3 grid grid-cols-1 gap-2">
                      {THEMES.map((item) => {
                        const active = theme === item.id;
                        return (
                          <button key={item.id} type="button" onClick={() => onThemeChange(item.id)} className={`flex items-center gap-3 rounded-[12px] border p-2.5 text-left transition-all ${active ? 'border-white/[0.16] bg-white/[0.055]' : 'border-white/[0.06] bg-white/[0.018] hover:bg-white/[0.045]'}`}>
                            <span className="h-7 w-7 shrink-0 rounded-full border border-white/[0.12]" style={{ background: item.color }} />
                            <span className="min-w-0 flex-1"><span className="block text-[10px] font-medium text-[#E2E5DE]">{item.label}</span><span className="mt-0.5 block text-[9px] text-[#828A82]">{item.note}</span></span>
                            {active && <Check className="h-3.5 w-3.5 shrink-0" style={{ color: activeColor }} />}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-3 rounded-[11px] border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                      <p className="text-[10px] font-medium text-[#DDE0D9]">Type and contrast</p>
                      <p className="mt-1 text-[9px] leading-4 text-[#858D85]">WinUtilX uses the system interface font with softened contrast for a calmer, more legible panel.</p>
                    </div>
                  </motion.div>
                )}

                {section === 'behavior' && (
                  <motion.div key="behavior" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
                    <ToggleRow title="Hide in full-screen apps" description="Keep the notch out of the way while games or video are full screen." value={autohide} onChange={setAutohide} />
                    <ToggleRow title="Start with Windows" description="Open WinUtilX quietly when you sign in." value={startup} onChange={setStartup} />
                    <ToggleRow title="Subtle interface sounds" description="Play a soft sound when switching between sections." value={sounds} onChange={setSounds} />
                  </motion.div>
                )}

                {section === 'shortcuts' && (
                  <motion.div key="shortcuts" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
                    {[
                      { title: 'Toggle notch visibility', description: 'Show or hide the notch', keys: ['Alt', '\\'] },
                      { title: 'Toggle notch visibility', description: 'Alternate visibility shortcut', keys: ['Ctrl', 'Shift', 'H'] },
                      { title: 'Circle snip', description: 'Select an area of the screen', keys: ['Ctrl', 'Shift', 'S'] },
                      { title: 'Screen capture', description: 'Select a region and add it to Shelf temporarily · Ctrl+Alt+X alternate', keys: ['Ctrl', 'Shift', 'X'] },
                      { title: 'Dictation', description: 'Open voice input', keys: ['Ctrl', 'Win'] },
                    ].map((item, index) => (
                      <div key={index} className="flex items-center justify-between gap-3 border-b border-white/[0.06] py-3">
                        <span><span className="block text-[11px] font-medium text-[#E4E6E0]">{item.title}</span><span className="mt-0.5 block text-[9px] text-[#858D85]">{item.description}</span></span>
                        <span className="flex shrink-0 items-center gap-1">{item.keys.map((key) => <kbd key={key} className="rounded-[6px] border border-white/[0.09] bg-white/[0.04] px-1.5 py-1 text-[9px] text-[#AFB6AE]">{key}</kbd>)}</span>
                      </div>
                    ))}
                  </motion.div>
                )}

                {section === 'profile' && (
                  <motion.div key="profile" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
                    <label htmlFor="notch-greeting-name" className="text-[11px] font-medium text-[#E3E6DF]">Name</label>
                    <p className="mt-1 text-[9px] text-[#899189]">The notch greets you by this name based on your local time.</p>
                    <input
                      id="notch-greeting-name"
                      type="text"
                      value={displayName}
                      maxLength={24}
                      onChange={(event) => onDisplayNameChange(event.target.value)}
                      onBlur={() => onDisplayNameChange(displayName.trim() || 'Aditya')}
                      placeholder="Your name"
                      className="mt-3 w-full rounded-[11px] border border-white/[0.09] bg-white/[0.035] px-3 py-2.5 text-[11px] text-[#E8E9E3] outline-none transition focus:border-white/25"
                    />
                    <div className="mt-3 rounded-[11px] border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                      <p className="text-[9px] uppercase tracking-[0.12em] text-[#788078]">Preview</p>
                      <p className="mt-1 flex items-center gap-2 text-[12px] font-semibold text-[#E7E9E2]"><span aria-hidden="true">{greetingPreview.emoji}</span><span>{greetingPreview.text}</span></p>
                    </div>
                  </motion.div>
                )}

                {section === 'ai' && (
                  <motion.div key="ai" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
                    <p className="text-[11px] font-medium text-[#E3E6DF]">Groq API key</p>
                    <p className="mt-1 text-[9px] leading-4 text-[#899189]">Used by Circle Search with Groq’s Qwen vision model. UtilityX stores the key encrypted for your Windows account and sends requests directly to Groq.</p>
                    <div className="mt-3 flex items-center justify-between rounded-[11px] border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                      <span className="text-[10px] text-[#C5CBC3]">{apiConfigured ? 'A key is saved on this PC' : 'No Groq API key saved'}</span>
                      <span className={`h-1.5 w-1.5 rounded-full ${apiConfigured ? 'bg-emerald-400' : 'bg-white/25'}`} />
                    </div>
                    <label htmlFor="groq-api-key" className="mt-3 block text-[10px] font-medium text-[#DDE0D9]">{apiConfigured ? 'Replace saved key' : 'API key'}</label>
                    <input
                      id="groq-api-key"
                      type="password"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      autoComplete="new-password"
                      spellCheck={false}
                      placeholder={apiConfigured ? 'Enter a new key to replace it' : 'Paste your Groq API key'}
                      className="mt-1.5 w-full rounded-[11px] border border-white/[0.09] bg-white/[0.035] px-3 py-2.5 text-[11px] text-[#E8E9E3] outline-none transition focus:border-white/25"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" disabled={apiBusy || !apiKey.trim()} onClick={saveApiKey} className="rounded-[9px] bg-white px-3 py-2 text-[10px] font-semibold text-black transition hover:bg-white/85 disabled:opacity-40">Save encrypted key</button>
                      <button type="button" disabled={apiBusy || (!apiConfigured && !apiKey.trim())} onClick={testApiKey} className="rounded-[9px] border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-[10px] font-medium text-[#D4D9D1] transition hover:bg-white/[0.09] disabled:opacity-40">Test connection</button>
                      {apiConfigured && <button type="button" disabled={apiBusy} onClick={removeApiKey} className="rounded-[9px] border border-white/[0.1] px-3 py-2 text-[10px] font-medium text-[#A8AEA6] transition hover:bg-white/[0.07] disabled:opacity-40">Remove key</button>}
                    </div>
                    {apiMessage && <p role="status" className="mt-2 rounded-[9px] border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-[9px] leading-4 text-[#BAC1B8]">{apiMessage}</p>}
                    <button type="button" onClick={() => invokeTauriStrict('open_external_url', { url: 'https://console.groq.com/keys' }).catch((error) => setApiMessage(String(error?.message || error)))} className="mt-3 text-[10px] font-medium text-[#D1D6CE] underline decoration-white/25 underline-offset-2 hover:text-white">Get a Groq API key</button>
                    <p className="mt-3 text-[9px] leading-4 text-[#737B74]">Circle Search sends only the selected crop and your question to Groq after you ask. The screenshot is not saved by UtilityX.</p>
                  </motion.div>
                )}
              </div>
              <footer className="flex items-center justify-between border-t border-white/[0.07] px-5 py-2"><span className="text-[9px] text-[#788078]">WinUtilX · Desktop utility</span><span className="text-[9px] text-[#788078]">Preferences save automatically</span></footer>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
