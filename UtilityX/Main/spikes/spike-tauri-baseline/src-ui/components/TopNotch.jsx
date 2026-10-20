import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronDown, 
  ChevronUp, 
  Sliders, 
  Calendar, 
  Activity, 
  Clipboard, 
  Grid, 
  Image as ImageIcon, 
  Power,
  Inbox,
  Smartphone,
  Settings
} from 'lucide-react';

import OutwardEars from './notch/OutwardEars';
import SettingsModal from './SettingsModal';
import ControlsTab from './tabs/ControlsTab';
import ShelfTab from './tabs/ShelfTab';
import TodayTab from './tabs/TodayTab';
import StatsTab from './tabs/StatsTab';
import ClipboardTab from './tabs/ClipboardTab';
import AppsTab from './tabs/AppsTab';
import WallpaperTab from './tabs/WallpaperTab';
import MobileTab from './tabs/MobileTab';
import PowerTab from './tabs/PowerTab';
import { invokeTauri, invokeTauriStrict } from '../utils/tauriBridge';

// Apple-calibrated fluid cubic bezier curve: silky-smooth deceleration
const TRANSITION_CONFIG = {
  type: "tween",
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1],
};

// Distinct dynamic heights per tab
const TAB_HEIGHTS = {
  controls: 490,
  shelf: 430,     // Staged cards and drop zone
  today: 490,
  stats: 450,
  clipboard: 460,
  apps: 470,
  wallpaper: 350,
  mobile: 430,    // Phone status and QR handshake
  power: 300,
};

const THEME_ACCENTS = {
  neon: {
    name: 'Neon white',
    primary: '#F5F7FF',
    primaryLight: '#FFFFFF',
    primaryDark: '#C9CED8',
    rgb: '245, 247, 255',
    bgAlpha: 'rgba(255, 255, 255, 0.10)',
    borderAlpha: 'rgba(255, 255, 255, 0.24)',
    activeText: '#000000',
  },
};

const TABS = [
  { id: 'today', label: 'Today', icon: Calendar },
  { id: 'shelf', label: 'Shelf', icon: Inbox },
  { id: 'stats', label: 'Stats', icon: Activity },
  { id: 'clipboard', label: 'Clipboard', icon: Clipboard },
  { id: 'apps', label: 'Apps', icon: Grid },
  { id: 'wallpaper', label: 'Wallpaper', icon: ImageIcon },
  { id: 'mobile', label: 'Mobile', icon: Smartphone },
  { id: 'controls', label: 'Controls', icon: Sliders },
  { id: 'power', label: 'Power', icon: Power },
];

export default function TopNotch({ onSelectWallpaper, wallpaperIndex = 0, accent: wallpaperAccent }) {
  // Stages: 'idle' | 'hovered' | 'full'
  const [stage, setStage] = useState('idle');
  const [activeTab, setActiveTab] = useState('today');
  const [accentTheme, setAccentTheme] = useState('neon');
  const [hoverDetails, setHoverDetails] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('winutilx-hover-details') || '["cpu","memory"]');
      return Array.isArray(saved) ? saved.slice(0, 3) : ['cpu', 'memory'];
    } catch { return ['cpu', 'memory']; }
  });
  const notchRef = useRef(null);

  useEffect(() => {
    const openShelfForDrop = () => {
      setActiveTab('shelf');
      setStage('full');
    };
    window.addEventListener('utilityx-shelf-drag-enter', openShelfForDrop);
    return () => window.removeEventListener('utilityx-shelf-drag-enter', openShelfForDrop);
  }, []);

  useEffect(() => {
    if (activeTab !== 'shelf') return undefined;
    const importClipboardFiles = async (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'v') return;
      try {
        const count = await invokeTauriStrict('shelf_import_clipboard_files');
        if (count > 0) {
          window.dispatchEvent(new CustomEvent('utilityx-shelf-files-dropped', { detail: { count } }));
        }
      } catch (error) {
        window.dispatchEvent(new CustomEvent('utilityx-shelf-drop-error', { detail: error?.message || String(error) }));
      }
    };
    window.addEventListener('keydown', importClipboardFiles);
    return () => window.removeEventListener('keydown', importClipboardFiles);
  }, [activeTab]);

  // Live Windows telemetry from native backend
  const [telemetry, setTelemetry] = useState({
    cpu_percent: 32,
    ram_mb: 16.9,
    battery_percent: 98,
    is_plugged: true,
  });

  const resolvedAccent = THEME_ACCENTS.neon;
  const accent = resolvedAccent;
  const accentColor = resolvedAccent.primary;
  const activeTextColor = resolvedAccent.activeText;
  const hoverMetricValues = {
    cpu: `CPU ${telemetry.cpu_percent}%`,
    memory: `MEM ${telemetry.ram_mb} MB`,
    battery: `BAT ${telemetry.battery_percent}%`,
    network: 'WI-FI',
    clock: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };
  const hoveredWidth = Math.min(444, 270 + hoverDetails.length * 58);

  useEffect(() => {
    try { localStorage.setItem('winutilx-accent-theme', accentTheme); } catch {}
  }, [accentTheme]);

  useEffect(() => {
    try { localStorage.setItem('winutilx-hover-details', JSON.stringify(hoverDetails)); } catch {}
  }, [hoverDetails]);

  useEffect(() => {
    const fetchTelemetry = async () => {
      const data = await invokeTauri('get_telemetry');
      if (data) {
        setTelemetry(data);
      }
    };
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 3000);
    return () => clearInterval(interval);
  }, []);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotchHidden, setIsNotchHidden] = useState(false);

  const updateNativeNotchRegion = (nextStage) => {
    const width = nextStage === 'full' ? 840 : nextStage === 'hovered' ? hoveredWidth : 270;
    const height = nextStage === 'full'
      ? (isSettingsOpen ? 490 : (TAB_HEIGHTS[activeTab] || 450))
      : 38;
    invokeTauri('update_notch_stage', { stage: nextStage, width, height });
  };

  const changeStage = (newStage) => {
    if (newStage === stage) return;
    setStage(newStage);
  };

  useLayoutEffect(() => {
    updateNativeNotchRegion(stage);
  }, [stage, activeTab, isSettingsOpen, hoverDetails]);

  // Global hotkeys to toggle notch visibility (Alt+\ and Ctrl+Shift+H)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Alt + \ or Ctrl + Shift + H to toggle visibility
      if ((e.altKey && e.key === '\\') || (e.ctrlKey && e.shiftKey && (e.key === 'H' || e.key === 'h'))) {
        e.preventDefault();
        setIsNotchHidden((prev) => {
          const next = !prev;
          invokeTauri('toggle_notch_visibility');
          return next;
        });
      }
      if (e.key === 'Escape') {
        if (isSettingsOpen) {
          setIsSettingsOpen(false);
        } else if (stage === 'full') {
          changeStage('idle');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSettingsOpen, stage]);

  // Close when clicking outside or when window blurs (focus shifts to background app)
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (stage === 'full' && !isSettingsOpen && notchRef.current && !notchRef.current.contains(e.target)) {
        changeStage('idle');
      }
    };

    const handleBlur = () => {
      if (stage === 'full' && !isSettingsOpen) {
        changeStage('idle');
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('blur', handleBlur);
    };
  }, [stage, isSettingsOpen]);

  // Current dynamic height and width of the notch
  const targetWidth = stage === 'full' ? 840 : stage === 'hovered' ? hoveredWidth : 270;

  const targetHeight = stage === 'full' 
    ? (isSettingsOpen ? 490 : (TAB_HEIGHTS[activeTab] || 450)) 
    : 38;

  const targetBottomRadius = stage === 'full' ? 28 : stage === 'hovered' ? 20 : 16;

  if (isNotchHidden) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => {
            setIsNotchHidden(false);
            invokeTauri('toggle_notch_visibility');
          }}
          className="mt-2 px-3.5 py-1 rounded-full bg-[#000000]/95 border border-[#F5F7FF]/25 text-[10px] text-[#F5F7FF] pointer-events-auto shadow-lg flex items-center gap-2 cursor-pointer hover:bg-[#111111] transition-colors"
          title="Click to restore notch, or press Alt+\ / Ctrl+Shift+H"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#F5F7FF]" />
          <span>Notch hidden · Press <kbd className="bg-white/10 px-1 py-0.5 rounded text-white">Alt+\</kbd> or <kbd className="bg-white/10 px-1 py-0.5 rounded text-white">Ctrl+Shift+H</kbd> to restore</span>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none pt-0">
      <motion.div
        ref={notchRef}
        animate={{
          width: targetWidth,
          height: targetHeight,
          borderBottomLeftRadius: targetBottomRadius,
          borderBottomRightRadius: targetBottomRadius,
        }}
        transition={TRANSITION_CONFIG}
        style={{
          transformOrigin: "top center",
          backgroundColor: '#000000',
          background: 'linear-gradient(180deg, #000000 0%, #000000 100%)',
          boxShadow: 'none',
        }}
        onMouseEnter={() => {
          if (stage === 'idle') changeStage('hovered');
        }}
        onMouseLeave={() => {
          if (stage === 'hovered') changeStage('idle');
        }}
        onClick={() => {
          if (stage !== 'full') changeStage('full');
        }}
        className={`pointer-events-auto relative select-none border-t-0 border-x border-b border-white/10 ${
          stage !== 'full' ? 'cursor-pointer' : ''
        }`}
      >
        {/* OUTWARD CURVES (Ears) at Top-Left and Top-Right meeting Screen Bezel */}
        <OutwardEars color="#000000" borderColor="rgba(255, 255, 255, 0.09)" size={18} />

        {/* Dynamic Top Rim Glow with wallpaper-based accent */}
        <div 
          className="absolute top-0 left-0 right-0 h-[1px] pointer-events-none z-20"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${accentColor}60 50%, transparent 100%)`
          }}
        />

        {/* Inner Content Shell (100% Solid Background & Cleanly Clipped Rounded Corners) */}
        <div 
          className="relative z-10 w-full h-full overflow-hidden"
          style={{
            borderBottomLeftRadius: targetBottomRadius,
            borderBottomRightRadius: targetBottomRadius,
            backgroundColor: '#000000',
            background: 'linear-gradient(180deg, #000000 0%, #000000 100%)',
          }}
        >
          {/* ============================================================ */}
          {/* 1 & 2. UNIFIED COMPACT NOTCH (Standby + Hover Telemetry/Media) */}
          {/* Always mounted in DOM â€” never unmounts, never gets lost!      */}
          {/* ============================================================ */}
          <div
            className={`absolute top-0 left-0 right-0 h-[38px] flex items-center justify-between px-3.5 select-none transition-opacity duration-150 z-10 ${
              stage === 'full' ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'
            }`}
          >
            <div className="flex items-center gap-2 shrink-0">
                  <span 
                    style={{ backgroundColor: accentColor }}
                    className="w-1.5 h-1.5 rounded-full shrink-0" 
                  />
                  <span className="text-[11px] font-semibold tracking-[-0.02em] text-[#ECEDE7] shrink-0">WinUtilX</span>

                  <div
                    className={`flex items-center gap-2 pl-2 border-l border-white/10 min-w-0 shrink-0 overflow-hidden transition-[max-width,opacity,transform,padding] duration-200 ${
                      stage === 'hovered'
                        ? 'max-w-[250px] opacity-100 translate-x-0'
                        : 'max-w-0 opacity-0 translate-x-1 pl-0 border-transparent pointer-events-none'
                    }`}
                  >
                    {hoverDetails.map((detail, index) => (
                      <React.Fragment key={detail}>
                        {index > 0 && <span className="text-white/20 text-[9px]">·</span>}
                        <span className="whitespace-nowrap text-[9px] font-medium tracking-[0.01em] text-[#A5ADA4]">{hoverMetricValues[detail]}</span>
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {/* Right Badge: Standby or Open Action */}
                <div className="flex items-center shrink-0">
                  {stage === 'hovered' ? (
                    <div
                      className="flex items-center gap-1 font-semibold transition-all duration-150"
                      style={{ color: accentColor }}
                    >
                      <span className="text-[10px]">Open</span>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <span className="text-[10px] font-mono text-slate-400">Standby</span>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  )}
                </div>
          </div>

          {/* ============================================================ */}
          {/* 3. FULL EXPANDED DRAWER: Smooth CSS Fade & Fluid Layout      */}
          {/* Always mounted in DOM â€” instant and immune to race conditions!*/}
          {/* ============================================================ */}
          <div
            className={`w-full h-full p-5 flex flex-col justify-between pointer-events-auto bg-[#000000] overflow-hidden transition-[opacity,transform] duration-200 ${
              stage === 'full' ? 'opacity-100 pointer-events-auto z-20 translate-y-0' : 'opacity-0 pointer-events-none z-0 -translate-y-1'
            }`}
          >
            {/* Top Tabs Bar */}
            <div className="flex items-center justify-between pb-2.5 border-b border-white/10 shrink-0">
              {/* Settings Icon on Top Left */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSettingsOpen(true);
                }}
                title="Preferences & Hotkeys"
                className="p-1.5 rounded-xl bg-slate-900/80 hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer border border-white/5 flex items-center justify-center shrink-0"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>

              <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-full border border-white/5 relative">
                {TABS.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      style={isActive ? { color: activeTextColor } : {}}
                      className={`relative px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer z-10 ${
                        isActive ? 'font-bold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="activeTabPill"
                          transition={{ type: "spring", stiffness: 450, damping: 35 }}
                          style={{ backgroundColor: accentColor }}
                          className="absolute inset-0 rounded-full shadow-md -z-10"
                        />
                      )}
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Close / Minimize Notch Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  changeStage('idle');
                }}
                title="Minimize Notch (Esc)"
                className="p-1.5 rounded-xl bg-slate-900/80 hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer border border-white/5 flex items-center justify-center shrink-0"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Tab Body View */}
            <div className="flex-1 overflow-hidden py-2.5">
              {activeTab === 'controls' && (
                <ControlsTab 
                  accent={accent}
                  onCollapse={() => changeStage('idle')} 
                />
              )}
              {activeTab === 'shelf' && (
                <ShelfTab 
                  accent={accent}
                  onCollapse={() => changeStage('idle')} 
                />
              )}
              {activeTab === 'today' && (
                <TodayTab 
                  accent={accent}
                  onCollapse={() => changeStage('idle')} 
                />
              )}
              {activeTab === 'stats' && (
                <StatsTab 
                  telemetry={telemetry} 
                  accent={accent}
                  onCollapse={() => changeStage('idle')} 
                />
              )}
              {activeTab === 'clipboard' && (
                <ClipboardTab 
                  accent={accent}
                  onCollapse={() => changeStage('idle')} 
                />
              )}
              {activeTab === 'apps' && (
                <AppsTab 
                  accent={accent}
                  onCollapse={() => changeStage('idle')} 
                />
              )}
              {activeTab === 'wallpaper' && (
                <WallpaperTab 
                  activeIndex={wallpaperIndex}
                  accent={accent}
                  onSelectWallpaper={onSelectWallpaper} 
                  onCollapse={() => changeStage('idle')} 
                />
              )}
              {activeTab === 'mobile' && (
                <MobileTab 
                  accent={accent}
                  onCollapse={() => changeStage('idle')} 
                />
              )}
              {activeTab === 'power' && (
                <PowerTab 
                  accent={accent}
                  onCollapse={() => changeStage('idle')} 
                />
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        accent={accent}
        theme={accentTheme}
        onThemeChange={setAccentTheme}
        hoverDetails={hoverDetails}
        onHoverDetailsChange={setHoverDetails}
        onReset={() => { setAccentTheme('neon'); setHoverDetails(['cpu', 'memory']); }}
      />
    </div>
  );
}

