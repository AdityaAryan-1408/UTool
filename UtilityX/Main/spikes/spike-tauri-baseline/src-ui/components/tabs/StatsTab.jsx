import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, BatteryCharging, CheckCircle2, Cpu, Download, HardDrive, MemoryStick, RefreshCw, Upload, Wifi, Zap } from 'lucide-react';
import { invokeTauriStrict } from '../../utils/tauriBridge';

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatRate(bytesPerSecond) {
  if (!bytesPerSecond) return '0 B/s';
  if (bytesPerSecond >= 1024 * 1024) return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  if (bytesPerSecond >= 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  return `${Math.round(bytesPerSecond)} B/s`;
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return 'Unavailable';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m remaining` : `${minutes}m remaining`;
}

function Gauge({ value, color, icon: Icon, label, valueLabel, subtitle, unavailable = false }) {
  const percent = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <div className="rounded-2xl bg-slate-900/60 border border-white/5 p-3 flex items-center gap-3 min-w-0">
      <div className="relative w-12 h-12 shrink-0 flex items-center justify-center">
        <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
          <path stroke="#252a35" strokeWidth="3" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
          {!unavailable && <path stroke={color} strokeDasharray={`${percent}, 100`} strokeWidth="3" strokeLinecap="round" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />}
        </svg>
        <span className="absolute text-slate-200"><Icon className="w-4 h-4" style={{ color }} /></span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2"><span className="text-xs font-bold text-white">{label}</span><span className="text-sm font-mono font-bold text-white">{unavailable ? '—' : valueLabel}</span></div>
        <div className="text-[10px] text-slate-400 truncate mt-1">{subtitle}</div>
        {!unavailable && <div className="h-1 rounded-full bg-slate-800 mt-2 overflow-hidden"><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${percent}%`, backgroundColor: color }} /></div>}
      </div>
    </div>
  );
}

export default function StatsTab({ accent }) {
  const [stats, setStats] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [networkTest, setNetworkTest] = useState({ status: 'idle', step: '', result: null, error: '' });
  const accentColor = accent?.primary || '#F5F7FF';

  const refresh = useCallback(async () => {
    try {
      const snapshot = await invokeTauriStrict('get_system_stats');
      setStats(snapshot);
      setUpdatedAt(Date.now());
      setError('');
    } catch (failure) {
      setError(failure?.message || 'Could not read Windows system statistics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 2000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const runNetworkTest = async () => {
    setNetworkTest({ status: 'running', step: 'Ping', result: null, error: '' });
    try {
      const ping = await invokeTauriStrict('test_network_latency');
      setNetworkTest({ status: 'running', step: 'Download', result: null, error: '' });
      const downloadMbps = await invokeTauriStrict('test_download_speed');
      setNetworkTest({ status: 'running', step: 'Upload', result: null, error: '' });
      const uploadMbps = await invokeTauriStrict('test_upload_speed');
      setNetworkTest({ status: 'done', step: '', result: { ...ping, downloadMbps, uploadMbps }, error: '' });
    } catch (failure) {
      const message = typeof failure === 'string' ? failure : failure?.message || String(failure || 'Network speed test failed.');
      setNetworkTest({ status: 'error', step: '', result: null, error: message });
    }
  };

  const diskPercent = stats?.diskTotalBytes ? stats.diskUsedBytes / stats.diskTotalBytes * 100 : null;
  const batteryText = stats?.batteryPercent == null ? 'Battery data unavailable' : `${stats.batteryPercent}%${stats.isPlugged ? ' · Plugged in' : ''}`;
  const remaining = stats?.batterySecondsRemaining == null || stats.isPlugged ? null : formatDuration(stats.batterySecondsRemaining);
  const lastUpdated = useMemo(() => updatedAt ? `${Math.max(0, Math.floor((Date.now() - updatedAt) / 1000))}s ago` : 'Waiting for data', [updatedAt, stats]);

  return (
    <div className="h-full min-h-0 flex flex-col gap-3">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300"><Activity className="w-3.5 h-3.5" style={{ color: accentColor }} /> Live system statistics <span className="text-[10px] font-normal text-slate-500">· {lastUpdated}</span></div>
        <button onClick={refresh} title="Refresh now" className="p-1 rounded-md text-slate-500 hover:text-white"><RefreshCw className="w-3.5 h-3.5" /></button>
      </div>

      <div className="grid grid-cols-3 gap-2.5 shrink-0">
        <Gauge value={stats?.cpuPercent} color={accentColor} icon={Cpu} label="CPU" valueLabel={stats ? `${Math.round(stats.cpuPercent)}%` : '—'} subtitle="Total processor load" unavailable={!stats} />
        <Gauge value={stats?.memoryPercent} color={accentColor} icon={MemoryStick} label="Memory" valueLabel={stats ? `${Math.round(stats.memoryPercent)}%` : '—'} subtitle={stats ? `${formatBytes(stats.memoryUsedBytes)} / ${formatBytes(stats.memoryTotalBytes)}` : 'Waiting for system data'} unavailable={!stats} />
        <Gauge value={stats?.gpuPercent} color="#72d6a2" icon={Activity} label="GPU · 3D" valueLabel={stats?.gpuPercent == null ? 'N/A' : `${Math.round(stats.gpuPercent)}%`} subtitle={stats?.gpuPercent == null ? 'Windows GPU counter unavailable' : 'Highest active 3D engine'} unavailable={stats?.gpuPercent == null} />
      </div>

      <div className="grid grid-cols-12 gap-2.5 flex-1 min-h-0">
        <div className="col-span-5 flex flex-col gap-2 min-h-0">
          <div className="rounded-2xl bg-slate-900/60 border border-white/5 p-3 shrink-0">
            <div className="flex items-center justify-between text-[11px]"><div className="flex items-center gap-2 text-slate-300"><HardDrive className="w-3.5 h-3.5 text-purple-300" /> System drive {stats?.diskName || ''}</div><span className="font-mono font-semibold text-white">{diskPercent == null ? '—' : `${Math.round(diskPercent)}%`}</span></div>
            <div className="h-1.5 rounded-full bg-slate-800 mt-2 overflow-hidden"><div className="h-full rounded-full bg-purple-400 transition-[width] duration-500" style={{ width: `${diskPercent || 0}%` }} /></div>
            <div className="flex justify-between text-[10px] text-slate-500 mt-1.5"><span>{stats ? `${formatBytes(stats.diskUsedBytes)} used` : 'Waiting for data'}</span><span>{stats ? `${formatBytes(stats.diskTotalBytes)} total` : ''}</span></div>
          </div>

          <div className="rounded-2xl bg-slate-900/60 border border-white/5 p-3 shrink-0">
            <div className="text-[11px] text-slate-300 mb-2">Live network traffic</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2 min-w-0"><Download className="w-3.5 h-3.5 text-cyan-300 shrink-0" /><div className="min-w-0"><div className="text-[9px] text-slate-500">Received</div><div className="text-[11px] font-mono font-semibold text-cyan-200 truncate">{stats ? formatRate(stats.networkDownloadBps) : '—'}</div></div></div>
              <div className="flex items-center gap-2 min-w-0"><Upload className="w-3.5 h-3.5 text-blue-300 shrink-0" /><div className="min-w-0"><div className="text-[9px] text-slate-500">Sent</div><div className="text-[11px] font-mono font-semibold text-blue-200 truncate">{stats ? formatRate(stats.networkUploadBps) : '—'}</div></div></div>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900/60 border border-white/5 p-3 flex-1 min-h-0 flex flex-col justify-center gap-2">
            <div className="flex items-center justify-between gap-2 text-[11px]"><div className="flex items-center gap-2 text-slate-300"><BatteryCharging className="w-3.5 h-3.5 text-emerald-300" /> Battery</div><span className="font-mono font-semibold text-emerald-200">{batteryText}</span></div>
            <div className="flex items-center justify-between text-[10px] text-slate-500"><span>{remaining || 'Remaining time unavailable'}</span><span>Uptime · {stats ? formatUptime(stats.uptimeSeconds) : '—'}</span></div>
          </div>
        </div>

        <div className="col-span-4 rounded-2xl bg-slate-900/60 border border-white/5 p-3 flex flex-col min-h-0">
          <div className="flex items-center justify-between pb-2 border-b border-white/5 text-[11px] font-semibold text-slate-400 shrink-0"><span>Top processes · memory</span><span>{stats ? `${stats.processCount} total` : '—'}</span></div>
          <div className="flex-1 min-h-0 overflow-y-auto pt-1.5 space-y-0.5">
            {stats?.processes?.length ? stats.processes.map((process, index) => (
              <div key={`${process.name}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 items-center py-1 border-b border-white/[0.03] last:border-0">
                <span className="text-[10px] text-slate-200 truncate" title={process.name}>{process.name}</span>
                <span className="text-[9px] font-mono text-slate-400">{formatBytes(process.memoryBytes)}</span>
                <span className="text-[9px] font-mono text-slate-500 w-8 text-right">{process.cpuPercent.toFixed(1)}%</span>
              </div>
            )) : <div className="h-full flex items-center justify-center text-[10px] text-slate-500">{loading ? 'Loading processes…' : 'No process data available'}</div>}
          </div>
          <div className="flex justify-end gap-3 pt-1.5 border-t border-white/5 text-[9px] text-slate-500"><span>Memory</span><span>CPU</span></div>
        </div>

        <div className="col-span-3 rounded-2xl bg-slate-900/60 border border-white/5 p-3 flex flex-col justify-between gap-1.5 min-h-0">
          <div className="min-h-0 flex-1 overflow-hidden">
            <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400"><Wifi className="w-3 h-3" /> Network speed</div>
            <div className="grid grid-cols-2 gap-2 mt-2 text-center">
              <div className="rounded-xl bg-black/20 px-1.5 py-1.5 min-w-0"><div className="text-[9px] text-slate-500 flex items-center justify-center gap-1"><Download className="w-3 h-3 text-cyan-300" /> Download</div><div className="text-sm font-bold font-mono text-cyan-100 truncate">{networkTest.result ? networkTest.result.downloadMbps.toFixed(1) : '—'}<span className="text-[9px] ml-1 text-slate-400">Mbps</span></div></div>
              <div className="rounded-xl bg-black/20 px-1.5 py-1.5 min-w-0"><div className="text-[9px] text-slate-500 flex items-center justify-center gap-1"><Upload className="w-3 h-3 text-blue-300" /> Upload</div><div className="text-sm font-bold font-mono text-blue-100 truncate">{networkTest.result ? networkTest.result.uploadMbps.toFixed(1) : '—'}<span className="text-[9px] ml-1 text-slate-400">Mbps</span></div></div>
            </div>
            <div className="flex items-center justify-center gap-1 text-[9px] text-slate-400 mt-2 truncate"><Wifi className="w-3 h-3 shrink-0" /><span className="truncate">{stats?.networkConnectionName || 'Finding connection…'}</span></div>
            <div className="flex items-center justify-center gap-2 text-[9px] font-mono text-slate-400 mt-1"><span>Ping (TCP) {networkTest.result ? `${Math.round(networkTest.result.latencyMs)} ms` : '—'}</span><span>·</span><span>Jitter {networkTest.result ? `${networkTest.result.jitterMs.toFixed(1)} ms` : '—'}</span></div>
            {networkTest.status === 'running' && <div className="text-[9px] text-cyan-300 text-center mt-1.5 animate-pulse">{networkTest.step} test · 30 seconds</div>}
            {networkTest.status === 'error' && <div className="max-h-8 overflow-y-auto break-words text-[8px] leading-3 text-rose-300 text-center mt-1" title={networkTest.error}>{networkTest.error}</div>}
            {networkTest.status === 'done' && <div className="flex items-center justify-center gap-1 text-[9px] text-emerald-300 mt-1.5"><CheckCircle2 className="w-3 h-3" /> 30s tests · Cloudflare</div>}
          </div>
          <button onClick={runNetworkTest} disabled={networkTest.status === 'running'} style={{ backgroundColor: accent?.bgAlpha || 'rgba(255,255,255,0.1)', borderColor: accent?.borderAlpha || 'rgba(255,255,255,0.2)', color: accentColor }} className="w-full py-2 rounded-xl border text-[10px] font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0 mt-2"><Zap className={`w-3.5 h-3.5 ${networkTest.status === 'running' ? 'animate-pulse' : ''}`} />{networkTest.status === 'running' ? `Testing ${networkTest.step}…` : 'Run speed test'}</button>
        </div>
      </div>

      {error && <div className="text-[10px] text-rose-300 shrink-0">{error}</div>}

    </div>
  );
}
