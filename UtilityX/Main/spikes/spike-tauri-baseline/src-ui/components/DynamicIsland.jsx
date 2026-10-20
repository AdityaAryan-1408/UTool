import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  Mic, 
  CheckCircle2, 
  Circle, 
  Music, 
  Play, 
  Pause, 
  ChevronDown, 
  ChevronUp, 
  Copy, 
  Sliders, 
  ExternalLink,
  Layers,
  Wand2,
  Calendar,
  Volume2
} from 'lucide-react';
import SoulCanvas from './SoulCanvas';

export default function DynamicIsland({
  soulType,
  onOpenLasso,
  onOpenDictation,
  onOpenLoadout,
  personality
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [todos, setTodos] = useState([
    { id: 1, text: 'Subscribe to Otism', done: true },
    { id: 2, text: 'Call Mom', done: false },
    { id: 3, text: 'Gym session', time: '6:00 PM', done: false }
  ]);

  const completedCount = todos.filter(t => t.done).length;
  const progressPercent = (completedCount / todos.length) * 100;

  const toggleTodo = (id) => {
    setTodos(todos.map(t => t.id === id ? { ...t, done: !t.done } : t));
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none pt-2 px-4">
      <motion.div
        layout
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 350, damping: 28 }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="pointer-events-auto"
      >
        <motion.div
          layout
          className={`glass-island rounded-3xl transition-all duration-300 relative overflow-hidden ${
            isExpanded ? 'w-[680px] p-5 shadow-[0_25px_60px_rgba(0,0,0,0.85)]' : 'w-[260px] py-1.5 px-4 cursor-pointer hover:shadow-[0_10px_30px_rgba(0,242,254,0.2)]'
          }`}
          onClick={() => {
            if (!isExpanded) setIsExpanded(true);
          }}
        >
          {/* Subtle Ambient Radial Glow */}
          <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 via-transparent to-transparent pointer-events-none" />

          {/* COLLAPSED ISLAND NOTCH VIEW */}
          {!isExpanded ? (
            <div className="flex items-center justify-between h-9 select-none">
              {/* Left: Waveform / Status */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5 h-3.5">
                  <span className="w-0.5 h-3 bg-cyan-400 rounded-full animate-pulse" />
                  <span className="w-0.5 h-2 bg-cyan-400 rounded-full animate-pulse delay-75" />
                  <span className="w-0.5 h-3.5 bg-cyan-400 rounded-full animate-pulse delay-150" />
                  <span className="w-0.5 h-1.5 bg-cyan-400 rounded-full animate-pulse delay-100" />
                </div>
                <span className="text-[11px] font-semibold tracking-wider text-slate-300">HITODAMA</span>
              </div>

              {/* Center: Living Soul Particle Flame */}
              <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center">
                <SoulCanvas soulType={soulType} size={42} isHovered={isHovered} />
              </div>

              {/* Right: Expand Arrow & Badge */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
                  {completedCount}/{todos.length}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-colors" />
              </div>
            </div>
          ) : (
            /* EXPANDED ISLAND DRAWER VIEW */
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="space-y-4"
            >
              {/* Header inside Expanded Island */}
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <SoulCanvas soulType={soulType} size={44} isHovered={true} />
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-white tracking-wide">Hitodama Soul</h2>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 font-semibold border border-cyan-500/30">
                        {personality}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">Ready for voice & screen interactions</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenLoadout();
                    }}
                    className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-white/10 transition-colors cursor-pointer text-xs flex items-center gap-1.5"
                    title="Customize Soul Loadout"
                  >
                    <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Loadout</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsExpanded(false);
                    }}
                    className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white border border-white/10 transition-colors cursor-pointer"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Main 3 Quick Trigger Tools */}
              <div className="grid grid-cols-3 gap-2.5">
                {/* 1. Circle to Ask Button */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenLasso();
                  }}
                  className="p-3 rounded-2xl bg-gradient-to-br from-slate-900/90 to-slate-800/60 border border-white/10 hover:border-cyan-500/50 text-left transition-all group cursor-pointer shadow-lg"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Wand2 className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-400">
                      Ctrl + Shift
                    </span>
                  </div>
                  <div className="text-xs font-bold text-white group-hover:text-cyan-400 transition-colors">
                    Circle to Ask
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Lasso anything on screen</div>
                </motion.button>

                {/* 2. Smart Dictation Button */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDictation();
                  }}
                  className="p-3 rounded-2xl bg-gradient-to-br from-slate-900/90 to-slate-800/60 border border-white/10 hover:border-blue-500/50 text-left transition-all group cursor-pointer shadow-lg"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Mic className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-400">
                      Ctrl + Win
                    </span>
                  </div>
                  <div className="text-xs font-bold text-white group-hover:text-blue-400 transition-colors">
                    Smart Dictate
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Talk badly, send it clean</div>
                </motion.button>

                {/* 3. Clipboard & Stash Vault Button */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="p-3 rounded-2xl bg-gradient-to-br from-slate-900/90 to-slate-800/60 border border-white/10 hover:border-emerald-500/50 text-left transition-all group cursor-pointer shadow-lg"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Layers className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                      5 items
                    </span>
                  </div>
                  <div className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">
                    Staged Shelf
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Drag-out ready buffers</div>
                </motion.button>
              </div>

              {/* Sub-Widgets Row: Interactive To-Do List + Now Playing */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                {/* Interactive To-Do List */}
                <div className="p-3 rounded-2xl bg-slate-900/50 border border-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-xs font-bold text-slate-200">Daily Objectives</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-emerald-400">
                      {completedCount}/{todos.length} done
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-1 rounded-full bg-slate-800 mb-2.5 overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400"
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPercent}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>

                  {/* Todo list items */}
                  <div className="space-y-1.5">
                    {todos.map((todo) => (
                      <div
                        key={todo.id}
                        onClick={() => toggleTodo(todo.id)}
                        className="flex items-center justify-between text-xs py-1 px-1.5 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {todo.done ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          ) : (
                            <Circle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          )}
                          <span className={`text-[11px] ${todo.done ? 'line-through text-slate-500' : 'text-slate-300'}`}>
                            {todo.text}
                          </span>
                        </div>
                        {todo.time && (
                          <span className="text-[9px] text-slate-500 font-mono">{todo.time}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Now Playing Widget */}
                <div className="p-3 rounded-2xl bg-slate-900/50 border border-white/5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <Music className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="text-xs font-bold text-slate-200">Now Playing</span>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-mono">
                        Spotify
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5 mt-1">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/30 to-purple-500/30 border border-white/10 flex items-center justify-center shrink-0">
                        <Volume2 className="w-4 h-4 text-cyan-300" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-slate-200 truncate">Ethereal Solarpunk Beats</div>
                        <div className="text-[10px] text-slate-400 truncate">Otism Sound Lab · Lo-Fi</div>
                      </div>
                    </div>
                  </div>

                  {/* Playback Controls & Scrubber */}
                  <div className="mt-3">
                    <div className="w-full h-1 rounded-full bg-slate-800 mb-2 overflow-hidden">
                      <div className="w-2/5 h-full bg-cyan-400" />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                      <span>1:24</span>
                      <button
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
                      >
                        {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
                      </button>
                      <span>3:42</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
