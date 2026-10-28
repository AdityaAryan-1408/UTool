import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  Wand2, 
  Mic, 
  Monitor, 
  Code2, 
  Shield, 
  Layers, 
  Cpu, 
  HardDrive, 
  Wifi, 
  Lock,
  ArrowUpRight
} from 'lucide-react';

import TopNotch from './components/TopNotch';
import LassoOverlay from './components/LassoOverlay';
import ScreenshotOverlay from './components/ScreenshotOverlay';
import DictationModal from './components/DictationModal';
import { isTauri, invokeTauri, invokeTauriStrict } from './utils/tauriBridge';
import { WALLPAPERS } from './utils/wallpapers';

export default function App() {
  const [isLassoOpen, setIsLassoOpen] = useState(false);
  const [isScreenshotOpen, setIsScreenshotOpen] = useState(false);
  const [pendingScreenshot, setPendingScreenshot] = useState(null);
  const [isDictationOpen, setIsDictationOpen] = useState(false);
  const [wallpaperIndex, setWallpaperIndex] = useState(0);
  const [showSimulator, setShowSimulator] = useState(!isTauri);
  const [settingsRequest, setSettingsRequest] = useState(null);

  const currentWallpaper = WALLPAPERS[wallpaperIndex] || WALLPAPERS[0];
  const currentAccent = currentWallpaper.accent;

  // The native window starts hidden so its initial compact dimensions never
  // flash. Show it only after React has mounted into the full-screen viewport.
  useEffect(() => {
    if (isTauri) {
      invokeTauri('show_main_window');
    }
  }, []);

  const handleOpenLasso = (open) => {
    setIsLassoOpen(open);
    if (isTauri) {
      invokeTauri('set_fullscreen_overlay', { enabled: open });
    }
  };

  const handleOpenScreenshot = async () => {
    try {
      if (isTauri) {
        // Clipboard mode makes the notch non-focusable; turn that off so the
        // full-screen region selector can receive pointer input.
        await invokeTauriStrict('set_clipboard_focus_mode', { enabled: false });
        await invokeTauriStrict('set_fullscreen_overlay', { enabled: true });
      }
      setIsScreenshotOpen(true);
    } catch (error) {
      console.error('Could not open screen capture overlay:', error);
    }
  };

  const handleCloseScreenshot = (restoreClipboardFocus = true) => {
    setIsScreenshotOpen(false);
    if (isTauri) invokeTauriStrict('set_fullscreen_overlay', { enabled: false }).catch(() => {});
    if (restoreClipboardFocus) window.dispatchEvent(new Event('utilityx-screen-capture-closed'));
  };

  // Global hotkeys (Ctrl+Shift for Lasso, Ctrl+Win for Dictation simulation)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Browser preview fallback; the native app uses a registered global hotkey.
      if (!isTauri && e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        e.preventDefault();
        handleOpenLasso(true);
      }
      if (!isTauri && e.ctrlKey && e.shiftKey && (e.key === 'X' || e.key === 'x')) {
        e.preventDefault();
        handleOpenScreenshot();
      }
      if (e.key === 'Escape') {
        handleOpenLasso(false);
        handleCloseScreenshot();
        setIsDictationOpen(false);
      }
    };
    const handleNativeCircleSearch = () => handleOpenLasso(true);
    const handleNativeScreenCapture = () => handleOpenScreenshot();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('utilityx-circle-search', handleNativeCircleSearch);
    window.addEventListener('utilityx-screen-capture', handleNativeScreenCapture);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('utilityx-circle-search', handleNativeCircleSearch);
      window.removeEventListener('utilityx-screen-capture', handleNativeScreenCapture);
    };
  }, [isLassoOpen]);

  return (
    <div className={`relative w-screen h-screen overflow-hidden select-none ${showSimulator ? 'bg-[#000000]' : 'bg-transparent'}`}>
      {/* 1. Photorealistic Desktop Wallpaper Background (Browser Simulator Only) */}
      {showSimulator && (
        <>
          <motion.div
            key={wallpaperIndex}
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0 bg-cover bg-center filter brightness-[0.85] contrast-[1.05] pointer-events-none"
            style={{ backgroundImage: `url(${currentWallpaper.url})` }}
          />
          <div className="absolute inset-0 bg-radial-at-c from-transparent via-black/20 to-black/60 pointer-events-none" />
        </>
      )}

      {/* 2. THE TOP NOTCH (3-Stage: Idle -> Hover Peek -> Click Full App) */}
      <TopNotch
        accent={currentAccent}
        wallpaperIndex={wallpaperIndex}
        onSelectWallpaper={(idx) => setWallpaperIndex(idx)}
        settingsRequest={settingsRequest}
        onSettingsRequestHandled={() => setSettingsRequest(null)}
        onOpenLasso={() => handleOpenLasso(true)}
        pendingScreenshot={pendingScreenshot}
        onClearPendingScreenshot={() => setPendingScreenshot(null)}
        onOpenDictation={() => setIsDictationOpen(true)}
      />

      {/* 3. SIMULATED DESKTOP WORKSPACE (Context under the Notch - Browser Simulator Only) */}
      {showSimulator && (
        <div className="relative z-10 w-full h-full pt-16 pb-20 px-10 flex gap-6 items-center justify-center pointer-events-none">
        {/* Mock Window 1: VS Code Editor */}
        <div className="w-[580px] h-[380px] rounded-2xl glass-panel shadow-2xl overflow-hidden pointer-events-auto border border-white/10 flex flex-col">
          <div className="h-9 px-4 bg-slate-900/90 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
              <span className="text-xs text-slate-400 font-mono ml-2 flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-cyan-400" />
                winutilx-daemon.rs
              </span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">Rust 2024 · WS_EX_NOACTIVATE</span>
          </div>

          <div className="flex-1 p-4 font-mono text-[11px] text-slate-300 space-y-1.5 overflow-hidden leading-relaxed bg-slate-950/70">
            <div><span className="text-purple-400">pub struct</span> <span className="text-cyan-300">WinUtilXDaemon</span> &#123;</div>
            <div className="pl-4 text-slate-400">// Native Top Notch Lifecycle Manager</div>
            <div className="pl-4"><span className="text-blue-400">top_notch:</span> <span className="text-emerald-400">Stage::Idle | Stage::HoverPeek | Stage::FullApp</span>,</div>
            <div className="pl-4"><span className="text-blue-400">idle_footprint:</span> <span className="text-emerald-400">3.8 MB RAM (0.0% CPU)</span>,</div>
            <div className="pl-4"><span className="text-blue-400">hotspot_gateway:</span> <span className="text-amber-300">192.168.137.1:4242</span>,</div>
            <div>&#125;</div>
            <div className="pt-2 text-slate-500">// Hover your cursor over the top notch above to see it expand!</div>
            <div className="p-3 mt-3 rounded-xl bg-slate-900/60 border border-cyan-500/20 text-cyan-300 text-[10px] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Hover the top bar → Expands slightly. Click it → Loads the complete app.</span>
            </div>
          </div>
        </div>

        {/* Mock Window 2: Ashfall Steam Store Card (Target for Circle Snip) */}
        <div className="w-[380px] h-[380px] rounded-2xl glass-panel shadow-2xl overflow-hidden pointer-events-auto border border-white/10 flex flex-col">
          <div className="h-44 relative bg-gradient-to-t from-slate-950 to-transparent overflow-hidden">
            <img
              src="https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80"
              alt="Game Banner"
              className="w-full h-full object-cover filter brightness-90"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
            <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider">Top Rated RPG</span>
                <h3 className="text-lg font-bold text-white">Ashfall: Wasteland</h3>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                9.8 ★
              </span>
            </div>
          </div>

          <div className="p-4 flex-1 flex flex-col justify-between bg-slate-950/80">
            <p className="text-xs text-slate-400 leading-relaxed">
              Explore dynamic weather, co-op survival dungeons, and acoustic soundscapes in an expansive open world.
            </p>

              <button
              onClick={() => handleOpenLasso(true)}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500/20 to-blue-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-cyan-500/10"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Circle This Card with Lasso</span>
            </button>
          </div>
        </div>
      </div>
      )}

      {/* 4. BOTTOM CONTROLS & TEST SHORTCUTS (Browser Simulator Only) */}
      {showSimulator && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 pointer-events-auto">
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="glass-panel py-2 px-4 rounded-2xl flex items-center gap-3 border border-white/10 shadow-2xl"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 pr-3 border-r border-white/10">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span className="font-bold text-white">WinUtilX</span>
            </div>

            <button
              onClick={() => handleOpenLasso(true)}
              className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 border border-white/10 transition-colors cursor-pointer"
            >
              <Wand2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Circle to Ask</span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-400">Ctrl+Shift+S</span>
            </button>

            <button
              onClick={() => setIsDictationOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 border border-white/10 transition-colors cursor-pointer"
            >
              <Mic className="w-3.5 h-3.5 text-blue-400" />
              <span>Smart Dictate</span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-400">Ctrl+Win</span>
            </button>

            {/* Wallpaper Toggle */}
            <button
              onClick={() => setWallpaperIndex((prev) => (prev + 1) % WALLPAPERS.length)}
              className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-white border border-white/10 transition-colors cursor-pointer ml-1"
              title="Cycle Wallpaper"
            >
              <Monitor className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        </div>
      )}

      {/* 5. MODALS & FULLSCREEN OVERLAYS */}
      <AnimatePresence>
        {isLassoOpen && (
          <LassoOverlay
            isOpen={isLassoOpen}
            onClose={() => handleOpenLasso(false)}
            onOpenSettings={() => {
              handleOpenLasso(false);
              setSettingsRequest({ section: 'ai', id: Date.now() });
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isScreenshotOpen && <ScreenshotOverlay onClose={handleCloseScreenshot} onCaptured={(file) => { setPendingScreenshot(file); handleCloseScreenshot(false); window.dispatchEvent(new Event('utilityx-screenshot-added')); }} />}
      </AnimatePresence>

      <AnimatePresence>
        {isDictationOpen && (
          <DictationModal isOpen={isDictationOpen} onClose={() => setIsDictationOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
