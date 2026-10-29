import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Smartphone, 
  QrCode, 
  Wifi, 
  Send, 
  Lock, 
  Clipboard, 
  CheckCircle2, 
  ChevronUp, 
  RefreshCw, 
  ShieldCheck, 
  DownloadCloud,
  BatteryCharging
} from 'lucide-react';
import { invokeTauri } from '../../utils/tauriBridge';

export default function MobileTab({ onCollapse, accent }) {
  const [clipboardSync, setClipboardSync] = useState(true);
  const [statusMsg, setStatusMsg] = useState('');
  const [beaming, setBeaming] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const accentColor = accent?.primary || '#F5F7FF';
  const activeTextColor = accent?.activeText || '#04101E';
  const accentBg = accent?.bgAlpha || 'rgba(0, 242, 254, 0.15)';
  const accentBorder = accent?.borderAlpha || 'rgba(0, 242, 254, 0.35)';

  const triggerToast = (msg) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(''), 2500);
  };

  const handleBeamFile = () => {
    setBeaming(true);
    triggerToast('Streaming 42 MB asset to Pixel 8 Pro over 5GHz Hotspot...');
    setTimeout(() => {
      setBeaming(false);
      triggerToast('Beam complete! File received in mobile downloads.');
    }, 1800);
  };

  const handleRemoteLock = async () => {
    triggerToast('Remote Lock WorkStation triggered from mobile session');
    await invokeTauri('lock_pc');
  };

  return (
    <div className="flex flex-col gap-3 h-full justify-between">
      {/* Top Gateway Status Bar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div 
            style={{ backgroundColor: accentBg, borderColor: accentBorder }}
            className="w-7 h-7 rounded-xl flex items-center justify-center border"
          >
            <Smartphone className="w-3.5 h-3.5" style={{ color: accentColor }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white tracking-wide">Mobile Companion Connect</span>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-bold border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Hotspot Direct
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono">
              192.168.137.1:4242 · TLS 1.3 SHA-256 Pinned
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowQR(!showQR)}
          style={showQR ? { backgroundColor: accentColor, color: activeTextColor } : {}}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
            showQR
              ? 'shadow-md font-bold'
              : 'bg-slate-900/80 text-slate-300 hover:text-white border-white/10'
          }`}
        >
          <QrCode className="w-3.5 h-3.5" />
          <span>{showQR ? 'Hide QR' : 'Pair New Phone'}</span>
        </button>
      </div>

      {/* Main Grid: Device Card & Actions OR QR Code View */}
      {showQR ? (
        /* QR Code Handshake View */
        <div className="flex-1 bg-slate-900/60 rounded-2xl border border-white/5 p-4 flex items-center justify-center gap-6">
          <div className="p-3 bg-white rounded-2xl shadow-2xl flex items-center justify-center">
            {/* SVG QR Code Simulation */}
            <svg className="w-32 h-32" viewBox="0 0 100 100" fill="#0B0E14">
              <rect width="100" height="100" fill="#FFFFFF" />
              {/* Corner markers */}
              <rect x="10" y="10" width="22" height="22" fill="#000000" rx="3" />
              <rect x="14" y="14" width="14" height="14" fill="#FFFFFF" rx="2" />
              <rect x="18" y="18" width="6" height="6" fill="#000000" />
              
              <rect x="68" y="10" width="22" height="22" fill="#000000" rx="3" />
              <rect x="72" y="14" width="14" height="14" fill="#FFFFFF" rx="2" />
              <rect x="76" y="18" width="6" height="6" fill="#000000" />

              <rect x="10" y="68" width="22" height="22" fill="#000000" rx="3" />
              <rect x="14" y="72" width="14" height="14" fill="#FFFFFF" rx="2" />
              <rect x="18" y="76" width="6" height="6" fill="#000000" />

              {/* Data pattern dots */}
              <circle cx="45" cy="20" r="3" fill="#000000" />
              <circle cx="55" cy="25" r="3" fill="#000000" />
              <circle cx="45" cy="35" r="3" fill="#000000" />
              <circle cx="50" cy="50" r="4" fill="#F5F7FF" />
              <circle cx="40" cy="65" r="3" fill="#000000" />
              <circle cx="60" cy="65" r="3" fill="#000000" />
              <circle cx="50" cy="80" r="3" fill="#000000" />
              <circle cx="75" cy="45" r="3" fill="#000000" />
              <circle cx="85" cy="55" r="3" fill="#000000" />
              <circle cx="80" cy="75" r="3" fill="#000000" />
            </svg>
          </div>

          <div className="max-w-xs space-y-2">
            <h4 className="text-sm font-bold text-white">Scan with Ollumi Mobile</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Open the companion app on your Android or iPhone and scan this code to pin the TLS certificate. No Wi-Fi router or internet connection needed.
            </p>
            <div className="flex items-center gap-2 pt-1 text-[11px] text-cyan-400 font-mono">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>TLS 1.3 Cert: 7E:B4:9A:F1:C0</span>
            </div>
          </div>
        </div>
      ) : (
        /* Connected Device & Controls View */
        <div className="grid grid-cols-12 gap-3 flex-1 overflow-hidden">
          {/* Left: Active Connected Phone Card (5 cols) */}
          <div className="col-span-5 p-3.5 rounded-2xl bg-slate-900/70 border border-white/5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-bold text-white">Pixel 8 Pro</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">Android 15</span>
              </div>

              <div className="space-y-2 mt-3 text-xs text-slate-300">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5 text-cyan-400" /> Link
                  </span>
                  <span className="font-mono text-cyan-300">5 GHz Direct (780 Mbps)</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" /> Battery
                  </span>
                  <span className="font-mono text-emerald-300">84% · Fast Charging</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Ping Latency</span>
                  <span className="font-mono text-purple-300">1.2 ms</span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-white/5 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">Shared Clipboard</span>
              <button
                onClick={() => {
                  setClipboardSync(!clipboardSync);
                  triggerToast(`Two-way clipboard sync ${!clipboardSync ? 'enabled' : 'paused'}`);
                }}
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-all cursor-pointer ${
                  clipboardSync ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'bg-slate-800 text-slate-500'
                }`}
              >
                {clipboardSync ? 'Active' : 'Off'}
              </button>
            </div>
          </div>

          {/* Right: Quick Actions & Incoming Share Sheet (7 cols) */}
          <div className="col-span-7 flex flex-col justify-between gap-2.5">
            {/* Quick Actions Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={handleBeamFile}
                disabled={beaming}
                style={{ backgroundColor: accentBg, borderColor: accentBorder }}
                className="p-3 rounded-2xl border text-left hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer group shadow-md"
              >
                <div className="flex items-center justify-between mb-1">
                  <Send className="w-4 h-4" style={{ color: accentColor }} />
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-400">
                    High-Speed
                  </span>
                </div>
                <div className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">
                  Beam File to Phone
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Stream over local 5GHz Wi-Fi</div>
              </button>

              <button
                onClick={handleRemoteLock}
                className="p-3 rounded-2xl bg-slate-900/70 border border-white/5 hover:border-emerald-500/40 text-left hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer group shadow-md"
              >
                <div className="flex items-center justify-between mb-1">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-bold">
                    Safe API
                  </span>
                </div>
                <div className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">
                  Simulate Remote Lock
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Test phone lock PC trigger</div>
              </button>
            </div>

            {/* Incoming Share Sheet Stream Log */}
            <div className="p-3 rounded-2xl bg-slate-900/50 border border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <DownloadCloud className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-slate-200 truncate">
                    Received: IMG_20261013_1301.heic (4.2 MB)
                  </div>
                  <div className="text-[9px] text-slate-400 font-mono">
                    Streamed from Phone Share Sheet → Drop Shelf Ready
                  </div>
                </div>
              </div>

              <span className="text-[10px] text-emerald-400 font-mono font-bold shrink-0">
                Auto-Staged
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Toast Bar / Status Footer */}
      <div className="h-5 flex items-center justify-center">
        {statusMsg && (
          <motion.div
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{ backgroundColor: accentBg, borderColor: accentBorder, color: accentColor }}
            className="flex items-center gap-1.5 px-3 py-0.5 rounded-full border text-[11px] font-medium"
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>{statusMsg}</span>
          </motion.div>
        )}
      </div>

      {/* Bottom Minimize Button */}
      <div className="flex justify-center pt-0.5 border-t border-white/5">
        <button 
          onClick={onCollapse}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-[11px] font-medium transition-colors cursor-pointer border border-white/5"
        >
          <ChevronUp className="w-3.5 h-3.5" />
          <span>Minimize</span>
        </button>
      </div>
    </div>
  );
}
