import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Sparkles, 
  Flame, 
  Smile, 
  Volume2, 
  Zap, 
  X, 
  Check, 
  Play, 
  Radio, 
  SlidersHorizontal,
  ChevronRight,
  ShieldCheck,
  Cpu
} from 'lucide-react';
import SoulCanvas from './SoulCanvas';

const SOUL_PRESETS = [
  { id: 'cyan', name: 'Hitodama Spirit', color: '#00F2FE', desc: 'Classic cyan ethereal flame' },
  { id: 'purple', name: 'Amethyst Void', color: '#C084FC', desc: 'Mystic deep violet astral aura' },
  { id: 'amber', name: 'Solar Flare', color: '#F59E0B', desc: 'Sunfire amber celestial ember' },
  { id: 'emerald', name: 'Jade Wisp', color: '#10B981', desc: 'Aurora green spirit flame' },
];

const PERSONALITY_PRESETS = [
  { id: 'True Chad', desc: 'Direct, bold, cuts straight to the answer without fluff', tag: 'High Confidence' },
  { id: 'Zen Companion', desc: 'Calm, thoughtful, soothing voice with mindful guidance', tag: 'Gentle & Warm' },
  { id: 'Senior Architect', desc: 'Rigorous engineering depth, code-first precision', tag: 'Technical Rigor' },
  { id: 'Concise Minimalist', desc: 'Ultra-brief responses capped at 1-2 sentences', tag: 'Zero Fluff' },
];

const VOICE_PRESETS = [
  { id: 'Charon', gender: 'Male Baritone', tone: 'Deep, resonant, authoritative', audioSample: 'I am ready. What shall we achieve today?' },
  { id: 'Lyra', gender: 'Female Natural', tone: 'Bright, energetic, articulate', audioSample: 'Good morning! Everything is in sync.' },
  { id: 'Echo', gender: 'Ethereal Neutral', tone: 'Soft, ambient whisper, meditative', audioSample: 'Breathe. The task is already complete.' },
  { id: 'Zephyr', gender: 'Casual Fast', tone: 'Modern tech-native speed', audioSample: 'Done. Pushed to your phone in two milliseconds.' },
];

export default function LoadoutHubModal({
  isOpen,
  onClose,
  soulType,
  setSoulType,
  personality,
  setPersonality,
  voice,
  setVoice
}) {
  const [activeTab, setActiveTab] = useState('slots'); // 'slots' or 'settings'
  const [voicePlaying, setVoicePlaying] = useState(false);
  const [selectedVoiceSample, setSelectedVoiceSample] = useState(VOICE_PRESETS[0].audioSample);

  const [abilities, setAbilities] = useState({
    lasso: true,
    dictation: true,
    hotspot: true,
    oledrag: true,
  });

  const toggleAbility = (key) => {
    setAbilities(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const playVoiceSample = (sample) => {
    setSelectedVoiceSample(sample);
    setVoicePlaying(true);
    setTimeout(() => setVoicePlaying(false), 2400);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 15 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0 }}
        className="glass-panel rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-white/10 shadow-[0_30px_90px_rgba(0,0,0,0.9)] flex flex-col"
      >
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SoulCanvas soulType={soulType} size={36} interactive={false} />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">Shape Your Hitodama</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 font-bold border border-cyan-500/30">
                  4 Active Slots
                </span>
              </div>
              <p className="text-xs text-slate-400">Customize the flame, voice, persona, and abilities of your Windows companion</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Central Soul Showcase Banner */}
          <div className="relative rounded-3xl p-6 bg-gradient-to-b from-slate-900/90 to-slate-950 border border-white/10 overflow-hidden flex items-center justify-between">
            <div className="absolute inset-0 bg-radial-at-c from-cyan-500/10 via-transparent to-transparent pointer-events-none" />
            
            <div className="space-y-1 z-10 max-w-md">
              <span className="text-[10px] uppercase font-bold tracking-widest text-cyan-400">Core Matrix</span>
              <h3 className="text-lg font-bold text-white">Living Spirit Flame</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Rendered live with fluid particle physics. The flame breathes in sync with your system activity and flares during voice interactions.
              </p>
              
              {/* Active Loadout Summary Pills */}
              <div className="flex flex-wrap gap-2 pt-2">
                <span className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300 font-semibold flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-cyan-400" />
                  {SOUL_PRESETS.find(s => s.id === soulType)?.name}
                </span>
                <span className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300 font-semibold flex items-center gap-1.5">
                  <Smile className="w-3.5 h-3.5 text-blue-400" />
                  {personality}
                </span>
                <span className="text-[11px] px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300 font-semibold flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                  Voice: {voice}
                </span>
              </div>
            </div>

            {/* Large Animated Soul Canvas in Center Right */}
            <div className="relative z-10 flex flex-col items-center justify-center pr-4">
              <div className="relative flex items-center justify-center">
                <div className="absolute w-32 h-32 rounded-full border border-cyan-500/20 animate-spin duration-[15000ms]" />
                <div className="absolute w-24 h-24 rounded-full border border-white/10 animate-ping duration-[3000ms]" />
                <SoulCanvas soulType={soulType} size={110} isHovered={true} isSpeaking={voicePlaying} />
              </div>
              <span className="text-[10px] font-mono text-cyan-400 mt-2 font-bold tracking-wider">
                {voicePlaying ? 'VOICE SYNTHESIS ACTIVE' : 'SPIRIT EQUIPPED'}
              </span>
            </div>
          </div>

          {/* THE 4 LOADOUT SLOTS GRID */}
          <div className="grid grid-cols-2 gap-4">
            {/* SLOT 1: SOUL FLAME PRESETS */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                  <Flame className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Slot 1 · Soul Flame</h4>
                  <p className="text-[10px] text-slate-400">Particle shader & aura coloration</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                {SOUL_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => setSoulType(preset.id)}
                    className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer flex items-center gap-2.5 ${
                      soulType === preset.id
                        ? 'bg-cyan-500/15 border-cyan-500/60 shadow-lg shadow-cyan-500/10'
                        : 'bg-slate-800/60 border-white/5 hover:border-white/20'
                    }`}
                  >
                    <div
                      className="w-3.5 h-3.5 rounded-full shrink-0 shadow-[0_0_8px_currentColor]"
                      style={{ backgroundColor: preset.color, color: preset.color }}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">{preset.name}</div>
                      <div className="text-[9px] text-slate-400 truncate">{preset.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* SLOT 2: PERSONALITY PRESETS */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                  <Smile className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Slot 2 · Personality</h4>
                  <p className="text-[10px] text-slate-400">Intelligence prompt & behavior tone</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                {PERSONALITY_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPersonality(p.id)}
                    className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                      personality === p.id
                        ? 'bg-blue-500/15 border-blue-500/60 shadow-lg shadow-blue-500/10'
                        : 'bg-slate-800/60 border-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">{p.id}</span>
                      {personality === p.id && <Check className="w-3 h-3 text-blue-400" />}
                    </div>
                    <div className="text-[9px] text-slate-400 mt-1 line-clamp-1">{p.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* SLOT 3: VOICE PRESETS */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
                    <Volume2 className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Slot 3 · Voice Model</h4>
                    <p className="text-[10px] text-slate-400">High-fidelity speech synthesis</p>
                  </div>
                </div>

                {voicePlaying && (
                  <span className="text-[10px] font-mono text-purple-400 animate-pulse font-bold">
                    Playing preview...
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                {VOICE_PRESETS.map((v) => (
                  <div
                    key={v.id}
                    onClick={() => {
                      setVoice(v.id);
                      playVoiceSample(v.audioSample);
                    }}
                    className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer flex items-center justify-between ${
                      voice === v.id
                        ? 'bg-purple-500/15 border-purple-500/60 shadow-lg shadow-purple-500/10'
                        : 'bg-slate-800/60 border-white/5 hover:border-white/20'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-white">{v.id}</div>
                      <div className="text-[9px] text-slate-400">{v.gender}</div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setVoice(v.id);
                        playVoiceSample(v.audioSample);
                      }}
                      className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 text-purple-300 flex items-center justify-center"
                    >
                      <Play className="w-2.5 h-2.5 ml-0.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* SLOT 4: ABILITIES TOGGLES */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Slot 4 · Integrated Abilities</h4>
                  <p className="text-[10px] text-slate-400">Active Windows hooks & companion tools</p>
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <div
                  onClick={() => toggleAbility('lasso')}
                  className="p-2 rounded-xl bg-slate-800/60 border border-white/5 flex items-center justify-between cursor-pointer hover:bg-slate-800"
                >
                  <span className="text-xs text-slate-200">⭕ Circle-to-Ask (`Ctrl+Shift`)</span>
                  <input type="checkbox" checked={abilities.lasso} readOnly className="accent-cyan-400 cursor-pointer" />
                </div>
                <div
                  onClick={() => toggleAbility('dictation')}
                  className="p-2 rounded-xl bg-slate-800/60 border border-white/5 flex items-center justify-between cursor-pointer hover:bg-slate-800"
                >
                  <span className="text-xs text-slate-200">🎙️ Smart Dictation (`Ctrl+Win`)</span>
                  <input type="checkbox" checked={abilities.dictation} readOnly className="accent-cyan-400 cursor-pointer" />
                </div>
                <div
                  onClick={() => toggleAbility('oledrag')}
                  className="p-2 rounded-xl bg-slate-800/60 border border-white/5 flex items-center justify-between cursor-pointer hover:bg-slate-800"
                >
                  <span className="text-xs text-slate-200">⚡ Zero-Disk OLE Drag-out</span>
                  <input type="checkbox" checked={abilities.oledrag} readOnly className="accent-cyan-400 cursor-pointer" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex items-center justify-between bg-slate-950/60">
          <span className="text-xs text-slate-400">Settings save automatically to local state</span>
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 hover:opacity-95 transition-opacity cursor-pointer"
          >
            Apply & Save Loadout
          </button>
        </div>
      </motion.div>
    </div>
  );
}
