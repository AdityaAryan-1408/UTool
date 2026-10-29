import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Lock,
  Moon,
  RotateCcw,
  Power,
  LogOut,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react';
import { invokeTauriStrict } from '../../utils/tauriBridge';

export default function PowerTab({ onCollapse, accent }) {
  const [workingAction, setWorkingAction] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);

  const accentColor = accent?.primary || '#00F2FE';
  const accentBg = accent?.bgAlpha || 'rgba(0, 242, 254, 0.15)';
  const accentBorder = accent?.borderAlpha || 'rgba(0, 242, 254, 0.35)';

  const handleLock = async () => {
    setWorkingAction('lock');
    setStatusMsg('');
    try {
      const locked = await invokeTauriStrict('lock_pc');
      if (!locked) throw new Error('Windows could not lock the workstation.');
      setStatusMsg('Workstation locked.');
    } catch (error) {
      setStatusMsg(error?.message || 'Could not lock the workstation.');
    } finally {
      setWorkingAction('');
    }
  };

  const handleSystemPower = async (action) => {
    setWorkingAction(action);
    setStatusMsg('');
    try {
      await invokeTauriStrict('request_system_power', { action });
      setStatusMsg(`${action === 'sleep' ? 'Sleep' : action === 'restart' ? 'Restart' : 'Shutdown'} requested.`);
    } catch (error) {
      setStatusMsg(error?.message || `Could not request ${action}.`);
    } finally {
      setWorkingAction('');
    }
  };

  const handleQuit = async () => {
    setWorkingAction('quit');
    setStatusMsg('');
    try {
      await invokeTauriStrict('quit_utilityx');
    } catch (error) {
      setStatusMsg(error?.message || 'Could not quit Ollumi.');
      setWorkingAction('');
    }
  };

  const confirmationCopy = {
    sleep: { title: 'Sleep this PC?', description: 'Your Windows session will remain open and can be resumed when you wake the PC.', confirm: 'Sleep', tone: 'blue' },
    restart: { title: 'Restart Windows?', description: 'Save your work first. Windows will close open applications as part of restarting.', confirm: 'Restart', tone: 'purple' },
    shutdown: { title: 'Shut down Windows?', description: 'Save your work first. Windows will close open applications as part of shutting down.', confirm: 'Shut down', tone: 'rose' },
    quit: { title: 'Quit Ollumi?', description: 'Ollumi will close completely. You can start it again whenever you need it.', confirm: 'Quit Ollumi', tone: 'neutral' },
  };

  const askToConfirm = (action) => setConfirmAction({ action, ...confirmationCopy[action] });

  const confirmPendingAction = () => {
    if (!confirmAction) return;
    const { action } = confirmAction;
    setConfirmAction(null);
    if (action === 'quit') handleQuit();
    else handleSystemPower(action);
  };

  const powerButtons = [
    {
      id: 'lock',
      title: 'Lock',
      sub: 'Lock workstation',
      icon: Lock,
      action: handleLock,
      color: 'from-amber-500/20 to-amber-600/10 border-amber-400/30 text-amber-300 hover:border-amber-400',
    },
    {
      id: 'sleep',
      title: 'Sleep',
      sub: 'Suspend system',
      icon: Moon,
      action: () => askToConfirm('sleep'),
      color: 'from-blue-500/20 to-blue-600/10 border-blue-400/30 text-blue-300 hover:border-blue-400',
    },
    {
      id: 'restart',
      title: 'Restart',
      sub: 'Reboot Windows',
      icon: RotateCcw,
      action: () => askToConfirm('restart'),
      color: 'from-purple-500/20 to-purple-600/10 border-purple-400/30 text-purple-300 hover:border-purple-400',
    },
    {
      id: 'shutdown',
      title: 'Shut down',
      sub: 'Power off PC',
      icon: Power,
      action: () => askToConfirm('shutdown'),
      color: 'from-rose-500/20 to-rose-600/10 border-rose-400/30 text-rose-300 hover:border-rose-400',
    },
    {
      id: 'quit',
      title: 'Quit Ollumi',
      sub: 'Close the app',
      icon: LogOut,
      action: () => askToConfirm('quit'),
      color: 'from-slate-500/20 to-slate-600/10 border-slate-400/30 text-slate-300 hover:border-slate-300',
    },
  ];

  return (
    <div className="relative flex h-full min-h-0 flex-col items-center gap-2 overflow-hidden py-1">
      <div className="shrink-0 text-center">
        <h3 className="text-sm font-bold tracking-wide text-white">System Power Options</h3>
        <p className="mt-0.5 text-xs text-slate-400">Control your Windows session or quit Ollumi</p>
      </div>

      <div className="grid w-full max-w-4xl shrink-0 grid-cols-5 gap-3">
        {powerButtons.map((button) => {
          const Icon = button.icon;
          const busy = workingAction === button.id;
          return (
            <motion.button
              key={button.id}
              type="button"
              whileHover={{ scale: 1.04, y: -2 }}
              whileTap={{ scale: 0.96 }}
              onClick={button.action}
              disabled={Boolean(workingAction)}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-2xl border bg-gradient-to-b p-3 shadow-lg transition-all disabled:cursor-wait disabled:opacity-60 ${button.color}`}
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/5 bg-black/40 shadow-md transition-transform group-hover:scale-110">
                <Icon className="h-5 w-5 stroke-[2]" />
              </div>
              <div className="text-center">
                <div className="text-xs font-bold tracking-wide text-white">{busy ? 'Working…' : button.title}</div>
                <div className="mt-0.5 text-[10px] text-slate-400">{button.sub}</div>
              </div>
            </motion.button>
          );
        })}
      </div>

      <div className="flex min-h-7 shrink-0 items-center justify-center">
        {statusMsg && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ backgroundColor: accentBg, borderColor: accentBorder, color: accentColor }}
            className="flex items-center gap-2 rounded-full border px-3 py-0.5 text-xs font-medium"
          >
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>{statusMsg}</span>
          </motion.div>
        )}
      </div>

      <div className="mt-auto flex w-full shrink-0 justify-center border-t border-white/5 pt-1">
        <button
          type="button"
          onClick={onCollapse}
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-white/5 bg-white/5 px-3 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ChevronUp className="h-3.5 w-3.5" />
          <span>Minimize</span>
        </button>
      </div>

      {confirmAction && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl bg-black/75 p-4 backdrop-blur-sm">
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="power-confirm-title"
            initial={{ opacity: 0, scale: 0.96, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#101114] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.7)]"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-white/80">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 id="power-confirm-title" className="text-sm font-semibold text-white">{confirmAction.title}</h4>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{confirmAction.description}</p>
              </div>
              <button type="button" onClick={() => setConfirmAction(null)} aria-label="Close confirmation" className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-white/10 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmAction(null)} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white">Cancel</button>
              <button type="button" onClick={confirmPendingAction} disabled={Boolean(workingAction)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50 ${confirmAction.tone === 'rose' ? 'border-rose-400/30 bg-rose-500/15 hover:bg-rose-500/25' : confirmAction.tone === 'blue' ? 'border-blue-400/30 bg-blue-500/15 hover:bg-blue-500/25' : confirmAction.tone === 'purple' ? 'border-purple-400/30 bg-purple-500/15 hover:bg-purple-500/25' : 'border-white/20 bg-white/10 hover:bg-white/15'}`}>{workingAction ? 'Working…' : confirmAction.confirm}</button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
