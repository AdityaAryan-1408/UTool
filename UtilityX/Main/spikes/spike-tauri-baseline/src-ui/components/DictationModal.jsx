import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Sparkles, X, Volume2, Copy, Check, Play, RefreshCw, Send } from 'lucide-react';

const DICTATION_EXAMPLES = [
  {
    raw: "Hey John! Let's go fishin' together at 6am this mornin'... ah, nevermind, make it 9am, then after that let's go drinkin' together. Also, take care of that boah of yours!",
    clean: "Hey John, let's go fishing together at 9:00 a.m. this morning. After that, let's go drinking together. Also, take care of that boy of yours!"
  },
  {
    raw: "Um so pull up last quarter's numbers... wait no, Q3 not Q2, compare them with this one, and uh tell me what actually changed.",
    clean: "Pull up Q3 numbers, compare them with this quarter, and report what actually changed."
  },
  {
    raw: "Can we reschedule the sync to... what time is free tomorrow? Maybe two... no let's do three thirty PM instead.",
    clean: "Can we reschedule the sync to 3:30 PM tomorrow instead?"
  }
];

export default function DictationModal({ isOpen, onClose }) {
  const [selectedExampleIndex, setSelectedExampleIndex] = useState(0);
  const [isSimulatingVoice, setIsSimulatingVoice] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  const currentExample = DICTATION_EXAMPLES[selectedExampleIndex];

  useEffect(() => {
    if (!isOpen) return;
    setActiveStep(0);
  }, [isOpen, selectedExampleIndex]);

  const simulateSpeech = () => {
    setIsSimulatingVoice(true);
    setActiveStep(1);
    setTimeout(() => {
      setActiveStep(2);
      setIsSimulatingVoice(false);
    }, 1800);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0 }}
        className="glass-panel rounded-3xl w-full max-w-2xl overflow-hidden border border-white/10 shadow-2xl relative"
      >
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
              <Mic className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Smart Dictation Studio</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 font-mono font-semibold border border-blue-500/30">
                  Ctrl + Win
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Talk badly. Send it clean.</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Audio Visualizer Pill */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 h-6">
                {[40, 75, 30, 90, 60, 85, 45, 95, 35, 70, 50, 80].map((h, i) => (
                  <motion.span
                    key={i}
                    animate={{
                      height: isSimulatingVoice ? [`${h * 0.3}%`, `${h}%`, `${h * 0.4}%`] : '20%'
                    }}
                    transition={{
                      repeat: Infinity,
                      duration: 0.6,
                      delay: i * 0.05
                    }}
                    className="w-1 bg-gradient-to-t from-blue-500 to-cyan-300 rounded-full"
                    style={{ height: '30%' }}
                  />
                ))}
              </div>
              <span className="text-xs font-semibold text-slate-300">
                {isSimulatingVoice ? 'Listening & processing tone...' : 'Press simulate or hold Ctrl+Win in Windows'}
              </span>
            </div>

            <button
              onClick={simulateSpeech}
              disabled={isSimulatingVoice}
              className="px-3 py-1.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-lg shadow-blue-500/20 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Simulate Voice</span>
            </button>
          </div>

          {/* Raw Messy Speech Box */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Raw Spoken Input (With hesitations & fillers)</span>
              <span className="text-[10px] font-mono text-slate-500">Captured Audio Stream</span>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900/40 border border-white/5 text-xs text-slate-400 leading-relaxed italic">
              {currentExample.raw}
            </div>
          </div>

          {/* Clean Synthesized Text with Sparkle Effect */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-cyan-400">
              <div className="flex items-center gap-1.5 font-bold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Polished Output (Ready to paste)</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 font-bold">100% Cleaned</span>
            </div>

            <motion.div
              layout
              className="p-4 rounded-2xl bg-gradient-to-br from-blue-950/40 to-slate-900/80 border border-cyan-500/30 text-sm font-medium text-slate-100 leading-relaxed shadow-lg relative overflow-hidden"
            >
              <div className="absolute top-2 right-2 flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              </div>
              {currentExample.clean}
            </motion.div>
          </div>

          {/* Example Selector Tabs */}
          <div className="pt-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Try scenario:</span>
              {DICTATION_EXAMPLES.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedExampleIndex(idx)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    selectedExampleIndex === idx
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                      : 'bg-slate-800 text-slate-400 hover:text-white border border-transparent'
                  }`}
                >
                  Scenario #{idx + 1}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(currentExample.clean);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy Clean'}</span>
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 hover:opacity-90 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-opacity cursor-pointer shadow-lg shadow-blue-500/20"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Inject to App</span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
