import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Cpu, 
  Activity, 
  HardDrive, 
  Download, 
  Upload, 
  BatteryCharging, 
  Wifi, 
  ChevronUp,
  Zap
} from 'lucide-react';

export default function StatsTab({ telemetry, onCollapse, accent }) {
  const [testingSpeed, setTestingSpeed] = useState(false);
  const [ping, setPing] = useState(85);
  const [jitter, setJitter] = useState(42);

  const accentColor = accent?.primary || '#00F2FE';
  const accentBg = accent?.bgAlpha || 'rgba(0, 242, 254, 0.15)';
  const accentBorder = accent?.borderAlpha || 'rgba(0, 242, 254, 0.35)';

  const runSpeedTest = () => {
    setTestingSpeed(true);
    setTimeout(() => {
      setPing(Math.floor(60 + Math.random() * 30));
      setJitter(Math.floor(20 + Math.random() * 25));
      setTestingSpeed(false);
    }, 1200);
  };

  const cpuVal = telemetry?.cpu_percent ? Math.round(telemetry.cpu_percent) : 32;
  const ramVal = 53;
  const gpuVal = 10;

  return (
    <div className="flex flex-col gap-3.5 h-full justify-between">
      {/* Top Row: 3 Radial Gauge Cards */}
      <div className="grid grid-cols-3 gap-3">
        {/* CPU Gauge Card */}
        <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-white/5 flex items-center gap-3.5">
          <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
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
                strokeDasharray={`${cpuVal}, 100`}
                strokeWidth="3.2"
                strokeLinecap="round"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className="absolute font-mono text-xs font-bold text-white">{cpuVal}%</span>
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-white">CPU</div>
            <div className="text-[10px] text-slate-400 truncate">13th Gen Intel Core i7-13620H</div>
            <div className="text-[9px] font-mono mt-0.5" style={{ color: accentColor }}>4.2 GHz · 239 proc</div>
          </div>
        </div>

        {/* GPU Gauge Card */}
        <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-white/5 flex items-center gap-3.5">
          <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
            <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-slate-800"
                strokeWidth="3.2"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-emerald-400"
                strokeDasharray={`${gpuVal}, 100`}
                strokeWidth="3.2"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className="absolute font-mono text-xs font-bold text-white">{gpuVal}%</span>
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-white">GPU</div>
            <div className="text-[10px] text-slate-400 truncate">NVIDIA GeForce RTX 4060</div>
            <div className="text-[9px] text-emerald-300 font-mono mt-0.5">51°C · 1.2 GB / 8.0 GB</div>
          </div>
        </div>

        {/* RAM Gauge Card */}
        <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-white/5 flex items-center gap-3.5">
          <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
            <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-slate-800"
                strokeWidth="3.2"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-cyan-400"
                strokeDasharray={`${ramVal}, 100`}
                strokeWidth="3.2"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className="absolute font-mono text-xs font-bold text-white">{ramVal}%</span>
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-white">RAM</div>
            <div className="text-[10px] text-slate-400 truncate">16.9 GB / 31.7 GB</div>
            <div className="text-[9px] text-cyan-300 font-mono mt-0.5">5600 MHz LPDDR5</div>
          </div>
        </div>
      </div>

      {/* Middle & Lower Section */}
      <div className="grid grid-cols-12 gap-3.5 flex-1">
        {/* Hardware Status Chips (5 cols) */}
        <div className="col-span-5 flex flex-col gap-2.5">
          <div className="p-3 rounded-2xl bg-slate-900/60 border border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <HardDrive className="w-4 h-4" />
              </div>
              <span className="text-xs text-slate-300">Disk NVMe</span>
            </div>
            <span className="text-xs font-mono font-bold text-white">412 / 931 GB</span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-900/60 border border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                <Download className="w-4 h-4" />
              </div>
              <span className="text-xs text-slate-300">Network Bandwidth</span>
            </div>
            <span className="text-xs font-mono font-bold text-cyan-300">1.2 MB/s ↓ · 320 KB/s ↑</span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-900/60 border border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <BatteryCharging className="w-4 h-4" />
              </div>
              <span className="text-xs text-slate-300">Battery & Uptime</span>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-300">98% · 5 h 12 m</span>
          </div>
        </div>

        {/* Top Processes Table (4 cols) */}
        <div className="col-span-4 p-3 rounded-2xl bg-slate-900/60 border border-white/5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-white/5 text-[11px] font-semibold text-slate-400">
              <span>Top Process</span>
              <span>Memory · CPU</span>
            </div>
            <div className="space-y-1.5 mt-2 text-xs">
              {[
                { name: 'Google Chrome', ram: '1.4 GB', cpu: '8%' },
                { name: 'Visual Studio Code', ram: '920 MB', cpu: '3%' },
                { name: 'Spotify', ram: '410 MB', cpu: '1%' },
                { name: 'Discord', ram: '380 MB', cpu: '1%' },
              ].map((p, idx) => (
                <div key={idx} className="flex items-center justify-between py-0.5">
                  <span className="text-[11px] text-slate-200 font-medium truncate">{p.name}</span>
                  <span className="text-[10px] font-mono text-slate-400">{p.ram} · {p.cpu}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Speed Test Card (3 cols) */}
        <div className="col-span-3 p-3 rounded-2xl bg-slate-900/60 border border-white/5 flex flex-col items-center justify-between text-center">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Network Latency</div>
            <div className="flex items-baseline justify-center gap-2 mt-2">
              <div>
                <span className="text-2xl font-bold font-mono text-white">{ping}</span>
                <span className="text-[10px] text-slate-400 ml-1">ms ping</span>
              </div>
            </div>
            <div className="text-[10px] font-mono text-slate-400 mt-1">{jitter} ms jitter</div>
          </div>

          <button
            onClick={runSpeedTest}
            disabled={testingSpeed}
            style={{ backgroundColor: accentBg, borderColor: accentBorder, color: accentColor }}
            className="w-full py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Zap className={`w-3.5 h-3.5 ${testingSpeed ? 'animate-spin' : ''}`} />
            <span>{testingSpeed ? 'Pinging...' : 'Run speed test'}</span>
          </button>
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
