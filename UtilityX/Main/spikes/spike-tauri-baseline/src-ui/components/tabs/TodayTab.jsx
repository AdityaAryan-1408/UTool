import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Clock, 
  CloudSun, 
  Play, 
  RotateCcw, 
  CheckCircle2, 
  Circle, 
  Plus, 
  ChevronUp,
  Calendar as CalendarIcon
} from 'lucide-react';

export default function TodayTab({ onCollapse, accent }) {
  const [timeStr, setTimeStr] = useState('09:41');
  const [periodStr, setPeriodStr] = useState('AM · Tue 21');
  
  // Timer State (5 min pomodoro)
  const [timeLeft, setTimeLeft] = useState(300);
  const [timerRunning, setTimerRunning] = useState(false);

  // Todo Items
  const [todos, setTodos] = useState([
    { id: 1, text: 'Buy Hitodama!', done: true },
    { id: 2, text: 'Test top notch outward curves', done: false },
    { id: 3, text: 'Review desktop telemetry', done: false },
  ]);
  const [newTodo, setNewTodo] = useState('');

  const accentColor = accent?.primary || '#00F2FE';
  const activeTextColor = accent?.activeText || '#04101E';

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const period = hours >= 12 ? 'PM' : 'AM';
      const formattedHours = (hours % 12 || 12).toString().padStart(2, '0');
      setTimeStr(`${formattedHours}:${minutes}`);
      
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayName = days[now.getDay()];
      const dayNum = now.getDate();
      setPeriodStr(`${period} · ${dayName} ${dayNum}`);
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let interval = null;
    if (timerRunning && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    } else if (timeLeft === 0) {
      setTimerRunning(false);
    }
    return () => clearInterval(interval);
  }, [timerRunning, timeLeft]);

  const toggleTodo = (id) => {
    setTodos(todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const handleAddTodo = (e) => {
    if (e.key === 'Enter' && newTodo.trim()) {
      setTodos([...todos, { id: Date.now(), text: newTodo.trim(), done: false }]);
      setNewTodo('');
    }
  };

  const timerMin = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const timerSec = (timeLeft % 60).toString().padStart(2, '0');
  const timerProgress = ((300 - timeLeft) / 300) * 100;

  return (
    <div className="flex flex-col gap-3.5 h-full justify-between">
      {/* 3-Column Layout */}
      <div className="grid grid-cols-12 gap-3.5 flex-1">
        {/* Column 1: Clock & Weather (3 cols) */}
        <div className="col-span-3 flex flex-col gap-3">
          {/* Digital Clock Card */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-white/5 flex flex-col items-center justify-center text-center flex-1">
            <div className="text-4xl font-extrabold tracking-tight text-white font-mono">
              {timeStr}
            </div>
            <div className="text-xs font-semibold text-slate-400 mt-1 uppercase tracking-wider">
              {periodStr}
            </div>
          </div>

          {/* Weather Card */}
          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-white/5 flex items-center justify-between">
            <div>
              <div className="text-xl font-bold text-white">32°C</div>
              <div className="text-[11px] text-slate-400 font-medium">Mostly clear</div>
            </div>
            <div 
              style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
              className="w-10 h-10 rounded-xl flex items-center justify-center"
            >
              <CloudSun className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Column 2: This Week & Focus Timer (5 cols) */}
        <div className="col-span-5 flex flex-col gap-3">
          {/* Calendar Strip Card */}
          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-white/5 flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span>This week</span>
              <span className="text-[11px] text-slate-400 font-mono">28 Oct - 4 Nov</span>
            </div>

            {/* Days Strip */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {[
                { day: 'Mon', num: 28, active: false },
                { day: 'Tue', num: 29, active: true },
                { day: 'Wed', num: 30, active: false },
                { day: 'Thu', num: 31, active: false },
                { day: 'Fri', num: 1, active: false },
                { day: 'Sat', num: 2, active: false },
                { day: 'Sun', num: 3, active: false },
              ].map((item) => (
                <div 
                  key={item.num}
                  style={item.active ? { backgroundColor: accentColor, color: activeTextColor } : {}}
                  className={`py-1.5 rounded-xl flex flex-col items-center justify-center text-[10px] transition-all ${
                    item.active 
                      ? 'font-bold shadow-md' 
                      : 'text-slate-400 hover:bg-white/5'
                  }`}
                >
                  <span className="opacity-80 text-[9px]">{item.day}</span>
                  <span className="text-xs">{item.num}</span>
                </div>
              ))}
            </div>

            <div className="text-[11px] font-medium flex items-center gap-1.5 pt-0.5" style={{ color: accentColor }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentColor }} />
              <span>Next: 11:00 AM · Daily fitness research</span>
            </div>
          </div>

          {/* Pomodoro Focus Timer Card */}
          <div className="p-3 rounded-2xl bg-slate-900/60 border border-white/5 flex items-center justify-between gap-4">
            {/* Circular Timer Ring */}
            <div className="flex items-center gap-3">
              <div className="relative w-14 h-14 flex items-center justify-center">
                <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-slate-800"
                    strokeWidth="3.2"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    style={{ stroke: accentColor }}
                    className="transition-all duration-300"
                    strokeDasharray={`${timerProgress}, 100`}
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <span className="absolute font-mono text-xs font-bold text-white">
                  {timerMin}:{timerSec}
                </span>
              </div>

              <div>
                <div className="text-xs font-bold text-white">Focus Timer</div>
                <div className="text-[10px] text-slate-400">Pomodoro block</div>
              </div>
            </div>

            {/* Timer Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTimerRunning(!timerRunning)}
                style={{ backgroundColor: accentColor, color: activeTextColor }}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold hover:scale-105 active:scale-95 transition-all shadow-md cursor-pointer"
              >
                {timerRunning ? 'Pause' : 'Start'}
              </button>
              <button
                onClick={() => {
                  setTimerRunning(false);
                  setTimeLeft(300);
                }}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Reset"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Column 3: Today Tasks (4 cols) */}
        <div className="col-span-4 p-3.5 rounded-2xl bg-slate-900/60 border border-white/5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <span className="text-xs font-bold text-white">Today</span>
              <span className="text-[10px] font-mono font-bold" style={{ color: accentColor }}>
                {todos.filter(t => t.done).length}/{todos.length} Done
              </span>
            </div>

            <div className="space-y-2 mt-2.5 max-h-44 overflow-y-auto pr-1">
              {todos.map((todo) => (
                <div
                  key={todo.id}
                  onClick={() => toggleTodo(todo.id)}
                  className="flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
                >
                  {todo.done ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
                  ) : (
                    <Circle className="w-4 h-4 text-slate-500 shrink-0" />
                  )}
                  <span className={`text-xs ${todo.done ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                    {todo.text}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-white/5 flex items-center gap-2">
            <Plus className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <input
              type="text"
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              onKeyDown={handleAddTodo}
              placeholder="+ Add a task..."
              className="w-full bg-transparent text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Bottom Minimize Button */}
      <div className="flex justify-center pt-0.5">
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
