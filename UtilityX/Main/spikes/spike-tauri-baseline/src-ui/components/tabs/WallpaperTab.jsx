import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  FolderPlus, 
  ImageIcon,
  ChevronLeft, 
  ChevronRight, 
  ChevronUp,
  Check,
  Trash2,
  Download,
  RefreshCw,
  Search,
} from 'lucide-react';
import { WALLPAPERS, ONLINE_WALLPAPER_CACHE, cacheOnlineWallpapers } from '../../utils/wallpapers';
import { invokeTauriStrict } from '../../utils/tauriBridge';

export default function WallpaperTab({ activeIndex = 0, onSelectWallpaper, onCollapse, accent }) {
  const [currentIdx, setCurrentIdx] = useState(activeIndex);
  const [filter, setFilter] = useState('Local');
  const [onlineCategory, setOnlineCategory] = useState('all');
  const [onlineSearchInput, setOnlineSearchInput] = useState('');
  const [onlineQuery, setOnlineQuery] = useState('');
  const [onlineWallpapers, setOnlineWallpapers] = useState([]);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [onlineError, setOnlineError] = useState('');
  const [onlineNotice, setOnlineNotice] = useState('');
  const [localWallpapers, setLocalWallpapers] = useState([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState('');
  const [localNotice, setLocalNotice] = useState('');
  const [applyingId, setApplyingId] = useState('');
  const [onlineActionId, setOnlineActionId] = useState('');
  const [cycleSettings, setCycleSettings] = useState({ enabled: false, selectedIds: [], mode: 'interval', intervalMinutes: 60, dailyTime: '09:00' });
  const [cycleSaving, setCycleSaving] = useState(false);
  const lastWheelTime = useRef(0);
  const onlineRequestId = useRef(0);

  const loadOnlineWallpapers = async (refresh = false, category = onlineCategory, query = onlineQuery) => {
    const requestId = ++onlineRequestId.current;
    const cacheKey = `${category}|${query.trim().toLocaleLowerCase()}`;
    const cached = ONLINE_WALLPAPER_CACHE?.[cacheKey];
    if (!refresh && cached?.length) { setOnlineWallpapers(cached); setCurrentIdx(0); setOnlineError(''); setOnlineLoading(false); return; }
    setOnlineLoading(true); setOnlineError('');
    try {
      const payload = await invokeTauriStrict('wallpaper_fetch_online', { category, query });
      const items = (Array.isArray(payload) ? payload : []).map((item) => ({
        id: item.id,
        title: item.title || `Wallpaper ${item.id}`,
        location: item.location || 'Online wallpaper',
        url: item.url,
        fullUrl: item.fullUrl,
        accent: WALLPAPERS[0].accent,
      }));
      if (!items.length) throw new Error('No wallpapers matched. Try another search or category.');
      cacheOnlineWallpapers(cacheKey, items);
      if (requestId === onlineRequestId.current) { setOnlineWallpapers(items); setCurrentIdx(0); }
    } catch (error) {
      if (requestId === onlineRequestId.current) setOnlineError(error?.message || 'Could not fetch online wallpapers.');
    } finally {
      if (requestId === onlineRequestId.current) setOnlineLoading(false);
    }
  };

  const refreshLocalWallpapers = async () => {
    setLocalLoading(true);
    try { setLocalWallpapers(await invokeTauriStrict('wallpaper_list_local')); setLocalError(''); }
    catch (error) { setLocalError(error?.message || String(error)); }
    finally { setLocalLoading(false); }
  };

  useEffect(() => {
    refreshLocalWallpapers();
    invokeTauriStrict('wallpaper_get_cycle_settings').then(setCycleSettings).catch(() => {});
  }, []);

  const saveCycleSettings = async () => {
    setCycleSaving(true);
    try { await invokeTauriStrict('wallpaper_set_cycle_settings', { settings: cycleSettings }); setLocalNotice(cycleSettings.enabled ? 'Wallpaper cycling schedule saved.' : 'Wallpaper cycling turned off.'); setLocalError(''); }
    catch (error) { setLocalError(error?.message || String(error)); }
    finally { setCycleSaving(false); }
  };

  const toggleCycleWallpaper = (id) => setCycleSettings((settings) => ({
    ...settings,
    selectedIds: settings.selectedIds.includes(id) ? settings.selectedIds.filter((selected) => selected !== id) : [...settings.selectedIds, id],
  }));

  const importLocalFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    setLocalLoading(true);
    setLocalError('');
    setLocalNotice('');
    try {
      for (const file of files) {
        if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} is over the 20 MB limit.`);
        const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, 480 / bitmap.width, 270 / bitmap.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const previewBase64 = canvas.toDataURL('image/jpeg', 0.78).split(',')[1];
        await invokeTauriStrict('wallpaper_import_local', { name: file.name, bytes, previewBase64 });
      }
      await refreshLocalWallpapers();
      setLocalNotice(`Saved ${files.length} wallpaper${files.length === 1 ? '' : 's'} to Ollumi storage.`);
    } catch (error) { setLocalError(error?.message || String(error)); }
    finally { setLocalLoading(false); }
  };

  const deleteLocalWallpaper = async (item) => {
    try {
      await invokeTauriStrict('wallpaper_delete_local', { id: item.id });
      setLocalWallpapers((items) => { const next = items.filter((saved) => saved.id !== item.id); setCurrentIdx((index) => Math.min(index, Math.max(0, next.length - 1))); return next; });
      setCycleSettings((settings) => ({ ...settings, selectedIds: settings.selectedIds.filter((id) => id !== item.id) }));
      setLocalError('');
    } catch (error) { setLocalError(error?.message || String(error)); }
  };

  const setAsWallpaper = async (item) => {
    setApplyingId(item.id);
    setLocalError('');
    setLocalNotice('');
    try {
      await invokeTauriStrict('wallpaper_set_local', { id: item.id });
      setLocalNotice(`Applied ${item.name} as your desktop wallpaper.`);
    } catch (error) { setLocalError(error?.message || String(error)); }
    finally { setApplyingId(''); }
  };

  const saveLocalWallpaper = async (item) => {
    setLocalError('');
    setLocalNotice('');
    try {
      const savedTo = await invokeTauriStrict('wallpaper_save_as', { id: item.id });
      if (savedTo) setLocalNotice(`Saved a copy to ${savedTo}`);
    } catch (error) { setLocalError(error?.message || String(error)); }
  };

  const saveOnlineWallpaper = async (item, apply) => {
    setOnlineActionId(item.id);
    setOnlineError('');
    setOnlineNotice('');
    try {
      const saved = await invokeTauriStrict('wallpaper_save_online', { id: item.id, url: item.fullUrl, thumbnailUrl: item.url, apply });
      setLocalWallpapers((items) => [saved, ...items.filter((existing) => existing.id !== saved.id)]);
      if (apply) setOnlineNotice(`Applied ${item.title} and saved it to Local wallpapers.`);
      else setOnlineNotice(`Saved ${item.title} to Local wallpapers.`);
    } catch (error) { setOnlineError(error?.message || String(error)); }
    finally { setOnlineActionId(''); }
  };

  useEffect(() => {
    setCurrentIdx(activeIndex);
  }, [activeIndex]);

  const handleSelect = (idx) => {
    setCurrentIdx(idx);
    if (onSelectWallpaper) {
      onSelectWallpaper(idx);
    }
  };

  const prev = () => {
    const count = filter === 'Online' ? onlineWallpapers.length : localWallpapers.length;
    if (count) setCurrentIdx((currentIdx - 1 + count) % count);
  };

  const next = () => {
    const count = filter === 'Online' ? onlineWallpapers.length : localWallpapers.length;
    if (count) setCurrentIdx((currentIdx + 1) % count);
  };

  // Smooth mouse-wheel scrolling
  const handleWheel = (e) => {
    const now = Date.now();
    // 250ms throttle so one wheel swipe advances exactly one wallpaper card
    if (now - lastWheelTime.current < 250) return;

    if (e.deltaY > 15 || e.deltaX > 15) {
      lastWheelTime.current = now;
      next();
    } else if (e.deltaY < -15 || e.deltaX < -15) {
      lastWheelTime.current = now;
      prev();
    }
  };

  const accentColor = accent?.primary || '#00F2FE';
  const activeTextColor = accent?.activeText || '#04101E';

  return (
    <div className="flex flex-col gap-2 h-full justify-between" onWheel={handleWheel}>
      {/* Top Filter Chips */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          {['Online', `Local (${localWallpapers.length})`].map((f) => (
            <button
              key={f}
              onClick={() => { const nextFilter = f.startsWith('Local') ? 'Local' : 'Online'; setFilter(nextFilter); setCurrentIdx(0); if (nextFilter === 'Online') loadOnlineWallpapers(); }}
              style={(filter === 'Local' && f.startsWith('Local')) || (filter === 'Online' && f === 'Online') ? { backgroundColor: accentColor, color: activeTextColor } : {}}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                (filter === 'Local' && f.startsWith('Local')) || (filter === 'Online' && f === 'Online')
                  ? 'shadow-md font-bold'
                  : 'bg-slate-900/60 text-slate-400 hover:text-white border border-white/5'
              }`}
            >
              {f}
            </button>
          ))}
          {filter === 'Online' && <label className="ml-1 flex items-center gap-1.5 text-xs text-slate-400">Category
            <select value={onlineCategory} onChange={(event) => { const category = event.target.value; setOnlineCategory(category); setCurrentIdx(0); loadOnlineWallpapers(false, category); }} className="rounded-xl border border-white/10 bg-slate-900/80 px-2.5 py-1.5 text-xs text-slate-200 outline-none hover:bg-slate-800">
              <option value="all">All</option>
              <option value="general">General</option>
              <option value="anime">Anime</option>
              <option value="people">People</option>
            </select>
          </label>}
        </div>

        {filter === 'Online' ? <form onSubmit={(event) => { event.preventDefault(); const query = onlineSearchInput.trim(); setOnlineQuery(query); setCurrentIdx(0); loadOnlineWallpapers(false, onlineCategory, query); }} className="flex items-center gap-1.5">
          <input type="search" value={onlineSearchInput} onChange={(event) => setOnlineSearchInput(event.target.value)} maxLength={100} placeholder="Search wallpapers" aria-label="Search online wallpapers" className="w-36 rounded-xl border border-white/10 bg-slate-900/80 px-2.5 py-1.5 text-xs text-slate-200 outline-none placeholder:text-slate-500 focus:border-white/25" />
          <button type="submit" disabled={onlineLoading} className="flex items-center gap-1 rounded-xl border border-white/10 bg-slate-900/80 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"><Search className="h-3.5 w-3.5" />Search</button>
        </form> : <label className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900/60 hover:bg-white/10 text-slate-400 hover:text-white text-xs font-medium border border-white/5 transition-colors cursor-pointer">
          <FolderPlus className="w-3.5 h-3.5" style={{ color: accentColor }} />
          <span>{localLoading ? 'Saving…' : 'Add wallpapers'}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/bmp" multiple className="hidden" onChange={importLocalFiles} disabled={localLoading} />
        </label>}
        {filter === 'Online' && <button type="button" onClick={() => loadOnlineWallpapers(true, onlineCategory, onlineQuery)} disabled={onlineLoading} className="flex items-center gap-1.5 rounded-xl border border-white/5 bg-slate-900/60 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-white/10 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${onlineLoading ? 'animate-spin' : ''}`} />Refresh</button>}
      </div>

      {filter === 'Local' && <div className="relative flex-1 min-h-0 overflow-hidden">
        <div className="absolute left-1/2 top-2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-white/10 bg-black/85 px-2 py-1.5 text-[10px] text-slate-200 shadow-lg" onClick={(event) => event.stopPropagation()}>
          <label className="flex items-center gap-1.5 whitespace-nowrap"><input type="checkbox" checked={cycleSettings.enabled} onChange={(event) => setCycleSettings((settings) => ({ ...settings, enabled: event.target.checked }))} />Cycle selected</label>
          <select value={cycleSettings.mode} onChange={(event) => setCycleSettings((settings) => ({ ...settings, mode: event.target.value }))} className="rounded bg-slate-800 px-1.5 py-1 text-[10px]"><option value="interval">Every</option><option value="daily">Daily at</option></select>
          {cycleSettings.mode === 'interval' ? <select value={cycleSettings.intervalMinutes} onChange={(event) => setCycleSettings((settings) => ({ ...settings, intervalMinutes: Number(event.target.value) }))} className="rounded bg-slate-800 px-1.5 py-1 text-[10px]">{[15, 30, 60, 120, 240, 360, 720, 1440].map((minutes) => <option key={minutes} value={minutes}>{minutes < 60 ? `${minutes} min` : `${minutes / 60} hr`}</option>)}</select> : <input type="time" value={cycleSettings.dailyTime} onChange={(event) => setCycleSettings((settings) => ({ ...settings, dailyTime: event.target.value }))} className="rounded bg-slate-800 px-1.5 py-1 text-[10px]" />}
          <button type="button" onClick={saveCycleSettings} disabled={cycleSaving} className="rounded bg-white/10 px-2 py-1 hover:bg-white/20 disabled:opacity-50">{cycleSaving ? 'Saving…' : 'Save schedule'}</button>
        </div>
        {localError && <div className="absolute bottom-1 left-1/2 z-40 -translate-x-1/2 rounded-full border border-rose-400/20 bg-black/90 px-3 py-1 text-[10px] text-rose-300">{localError}</div>}
        {localNotice && <div className="absolute bottom-1 left-1/2 z-40 -translate-x-1/2 rounded-full border border-white/10 bg-black/90 px-3 py-1 text-[10px] text-emerald-300">{localNotice}</div>}
        {localLoading ? <div className="flex h-full items-center justify-center text-xs text-slate-400">Loading local wallpapers…</div> : localWallpapers.length ? <div className="relative flex h-full w-full items-center justify-center overflow-hidden select-none" style={{ perspective: '1000px' }}>
          <button onClick={prev} disabled={localWallpapers.length <= 1} className="absolute left-2 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-slate-900/80 text-white hover:bg-slate-800 disabled:cursor-default disabled:opacity-35" title="Previous wallpaper"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={next} disabled={localWallpapers.length <= 1} className="absolute right-2 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-slate-900/80 text-white hover:bg-slate-800 disabled:cursor-default disabled:opacity-35" title="Next wallpaper"><ChevronRight className="h-4 w-4" /></button>
          <div className="relative flex h-full w-full items-center justify-center">
            {localWallpapers.map((item, idx) => {
              const offset = idx - currentIdx;
              if (Math.abs(offset) > 1) return null;
              const isCenter = offset === 0;
              return <motion.div key={item.id} onClick={() => setCurrentIdx(idx)} drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.2} onDragEnd={(event, info) => { if (info.offset.x > 40) prev(); else if (info.offset.x < -40) next(); }} animate={{ x: offset * 275, scale: isCenter ? 1 : 0.72, rotateY: offset * -16, opacity: isCenter ? 1 : 0.55, zIndex: 10 - Math.abs(offset) }} transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }} style={{ transformStyle: 'preserve-3d', backgroundImage: item.previewDataUrl ? `url(${item.previewDataUrl})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center', borderColor: isCenter ? accentColor : 'rgba(255,255,255,0.1)', boxShadow: isCenter ? `0 8px 24px ${accent?.borderAlpha || 'rgba(245,158,11,0.3)'}` : 'none' }} className={`absolute flex h-[min(390px,58vh)] w-[min(520px,62vw)] flex-col justify-end overflow-hidden rounded-2xl border bg-slate-900 shadow-2xl ${isCenter ? 'ring-2' : ''}`}>
                <div className="bg-gradient-to-t from-black/95 via-black/55 to-transparent p-4">
                  <div className="truncate text-sm font-bold text-white">{item.name}</div>
                  <div className="mb-3 text-xs text-slate-300">{(item.sizeBytes / (1024 * 1024)).toFixed(1)} MB</div>
                  {isCenter && <><div className="mb-2" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}><button type="button" onClick={() => toggleCycleWallpaper(item.id)} className={`rounded-md border px-2 py-1 text-[10px] ${cycleSettings.selectedIds.includes(item.id) ? 'border-emerald-300/40 bg-emerald-950/50 text-emerald-200' : 'border-white/20 bg-black/50 text-slate-200'}`}>{cycleSettings.selectedIds.includes(item.id) ? '✓ Included in cycle' : '＋ Include in cycle'}</button></div><div className="flex gap-2" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}><button type="button" disabled={Boolean(applyingId)} onClick={() => setAsWallpaper(item)} className="flex-1 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-slate-200 disabled:opacity-50">{applyingId === item.id ? 'Applying…' : 'Set as wallpaper'}</button><button type="button" onClick={() => saveLocalWallpaper(item)} className="rounded-lg border border-white/50 bg-black/60 px-3 py-2 text-xs font-semibold text-white hover:bg-black/80"><Download className="mr-1 inline h-3.5 w-3.5" />Save as…</button><button type="button" onClick={() => deleteLocalWallpaper(item)} title="Delete wallpaper" className="rounded-lg border border-rose-300/30 bg-rose-950/60 px-3 py-2 text-xs text-rose-200 hover:bg-rose-900"><Trash2 className="h-3.5 w-3.5" /></button></div></>}
                </div>
              </motion.div>;
            })}
          </div>
        </div> : <div className="flex h-full items-center justify-center text-center text-xs text-slate-500">No local wallpapers yet. Choose Add wallpapers to copy images into Ollumi storage.</div>}
      </div>}

      {/* 3D Cover Flow Carousel with wheel & drag support */}
      {filter === 'Online' && <div className="relative flex-1 min-h-0">
        {onlineNotice && <div className="absolute bottom-1 left-1/2 z-40 -translate-x-1/2 rounded-full border border-white/10 bg-black/90 px-3 py-1 text-[10px] text-emerald-300">{onlineNotice}</div>}
        {onlineError && <div className="absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-black/90 px-8 text-center text-xs text-rose-300">{onlineError}</div>}
        {onlineLoading && <div className="absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-black/80 text-xs text-slate-300">Fetching wallpapers…</div>}
        {onlineWallpapers.length === 0 && !onlineLoading ? <div className="flex h-full items-center justify-center text-xs text-slate-500">Click Refresh to fetch wallpapers.</div> : <div 
        className="relative w-full h-full flex items-center justify-center overflow-hidden py-1 select-none" 
        style={{ perspective: '1000px' }}
      >
        {/* Navigation Buttons */}
        <button
          onClick={prev}
          className="absolute left-2 z-20 w-8 h-8 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white flex items-center justify-center border border-white/10 backdrop-blur-md transition-all shadow-lg cursor-pointer"
          title="Previous Wallpaper"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <button
          onClick={next}
          className="absolute right-2 z-20 w-8 h-8 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white flex items-center justify-center border border-white/10 backdrop-blur-md transition-all shadow-lg cursor-pointer"
          title="Next Wallpaper"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* 3D Cards Track */}
        <div className="flex items-center justify-center w-full h-full relative">
          {onlineWallpapers.map((wp, idx) => {
            const offset = idx - currentIdx;
            const isCenter = offset === 0;
            const isVisible = Math.abs(offset) <= 1;

            if (!isVisible) return null;

            // 3D Cover Flow Transform Calculations
            const translateX = offset * 275;
            const rotateY = offset * -16;
            const scale = isCenter ? 1 : 0.72;
            const zIndex = 10 - Math.abs(offset);
            const opacity = isCenter ? 1 : 0.55;

            return (
              <motion.div
                key={wp.id}
                onClick={() => setCurrentIdx(idx)}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.2}
                onDragEnd={(e, info) => {
                  if (info.offset.x > 40) prev();
                  else if (info.offset.x < -40) next();
                }}
                animate={{
                  x: translateX,
                  scale,
                  rotateY,
                  opacity,
                  zIndex,
                }}
                transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  transformStyle: 'preserve-3d',
                  backgroundImage: `url(${wp.url})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  borderColor: isCenter ? accentColor : 'rgba(255, 255, 255, 0.1)',
                  boxShadow: isCenter ? `0 8px 24px ${accent?.borderAlpha || 'rgba(245, 158, 11, 0.3)'}` : 'none'
                }}
                className={`absolute w-[min(520px,62vw)] h-[min(390px,58vh)] rounded-2xl overflow-hidden cursor-pointer shadow-2xl border transition-all ${
                  isCenter ? 'ring-2' : 'hover:opacity-90'
                }`}
              >
                {/* Gradient vignette */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent flex flex-col justify-end p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-white drop-shadow-md">{wp.title}</div>
                      <div className="text-xs text-slate-300 drop-shadow-md">{wp.location}</div>
                    </div>
                    {isCenter && (
                      <span 
                        style={{ backgroundColor: accentColor, color: activeTextColor }}
                        className="w-5 h-5 rounded-full flex items-center justify-center shadow-md font-bold"
                      >
                        <Check className="w-3 h-3 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  {isCenter && <div className="mt-3 flex gap-2" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}><button type="button" disabled={Boolean(onlineActionId)} onClick={() => saveOnlineWallpaper(wp, true)} className="flex-1 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-slate-200 disabled:opacity-50">{onlineActionId === wp.id ? 'Downloading…' : 'Set as wallpaper'}</button><button type="button" disabled={Boolean(onlineActionId)} onClick={() => saveOnlineWallpaper(wp, false)} className="flex-1 rounded-lg border border-white/50 bg-black/60 px-3 py-2 text-xs font-semibold text-white hover:bg-black/80 disabled:opacity-50">Save to Local</button></div>}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>}
      </div>}

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
