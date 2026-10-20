import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Lock, 
  Moon, 
  RotateCcw, 
  Power, 
  ChevronUp, 
  CheckCircle2 
} from 'lucide-react';
import { invokeTauri } from '../../utils/tauriBridge';

export default function PowerTab({ onCollapse, accent }) {
  const [lockedMsg, setLockedMsg] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const accentColor = accent?.primary || '#00F2FE';
  const accentBg = accent?.bgAlpha || 'rgba(0, 242, 254, 0.15)';
  const accentBorder = accent?.borderAlpha || 'rgba(0, 242, 254, 0.35)';

  const handleLock = async () => {
    setLockedMsg(true);
    setStatusMsg('Locking WorkStation...');
    await invokeTauri('lock_pc');
    setTimeout(() => {
      setLockedMsg(false);
      setStatusMsg('');
    }, 2500);
  };

  const handleAction = (name) => {
    setStatusMsg(`${name} command queued (Safe Mock)`);
    setTimeout(() => setStatusMsg(''), 2500);
  };

  const POWER_BUTTONS = [
    {
      id: 'lock',
      title: 'Lock',
      sub: 'Lock WorkStation',
      icon: Lock,
      action: handleLock,
      color: 'from-amber-500/20 to-amber-600/10 border-amber-400/30 text-amber-300 hover:border-amber-400',
    },
    {
      id: 'sleep',
      title: 'Sleep',
      sub: 'Suspend System',
      icon: Moon,
      action: () => handleAction('Sleep'),
      color: 'from-blue-500/20 to-blue-600/10 border-blue-400/30 text-blue-300 hover:border-blue-400',
    },
    {
      id: 'restart',
      title: 'Restart',
      sub: 'Reboot Windows',
      icon: RotateCcw,
      action: () => handleAction('Restart'),
      color: 'from-purple-500/20 to-purple-600/10 border-purple-400/30 text-purple-300 hover:border-purple-400',
    },
    {
      id: 'shutdown',
      title: 'Shut down',
      sub: 'Power Off PC',
      icon: Power,
      action: () => handleAction('Shutdown'),
      color: 'from-rose-500/20 to-rose-600/10 border-rose-400/30 text-rose-300 hover:border-rose-400',
    },
  ];

  return (
    <div className="flex flex-col gap-4 h-full justify-between items-center py-2">
      {/* Header Message */}
      <div className="text-center">
        <h3 className="text-sm font-bold text-white tracking-wide">System Power Options</h3>
        <p className="text-xs text-slate-400 mt-0.5">Quick power control and user session management</p>
      </div>

      {/* 4 Power Action Buttons */}
      <div className="grid grid-cols-4 gap-4 w-full max-w-xl">
        {POWER_BUTTONS.map((btn) => {
          const Icon = btn.icon;
          return (
            <motion.button
              key={btn.id}
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={btn.action}
              className={`p-4 rounded-2xl bg-gradient-to-b border flex flex-col items-center justify-center gap-2.5 transition-all cursor-pointer shadow-lg group ${btn.color}`}
            >
              <div className="w-11 h-11 rounded-2xl bg-black/40 flex items-center justify-center border border-white/5 group-hover:scale-110 transition-transform shadow-md">
                <Icon className="w-5 h-5 stroke-[2]" />
              </div>

              <div className="text-center">
                <div className="text-xs font-bold text-white tracking-wide">{btn.title}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{btn.sub}</div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Status Banner */}
      <div className="h-5">
        {statusMsg && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{ backgroundColor: accentBg, borderColor: accentBorder, color: accentColor }}
            className="flex items-center gap-2 px-3 py-0.5 rounded-full border text-xs font-medium"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{statusMsg}</span>
          </motion.div>
        )}
      </div>

      {/* Bottom Minimize Button */}
      <div className="flex justify-center pt-0.5 border-t border-white/5 w-full">
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
