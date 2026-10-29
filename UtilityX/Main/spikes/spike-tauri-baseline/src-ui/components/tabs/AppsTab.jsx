import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, Check, ChevronUp, EyeOff, ExternalLink, Info, Pin, PinOff, RefreshCw, Search, Smartphone, StickyNote } from 'lucide-react';
import { invokeTauriStrict } from '../../utils/tauriBridge';
import { readPreference } from '../../utils/ollumi';

const PREFS_KEY = 'ollumi-app-preferences-v1';
const HIDDEN_APPS_KEY = 'ollumi-hidden-apps-v1';
const APPS_CACHE_KEY = 'ollumi-installed-apps-cache-v1';

function readPreferences() {
  try {
    const value = JSON.parse(readPreference(PREFS_KEY, ['utilityx-app-preferences-v1'], '{}'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function readHiddenApps() {
  try {
    const value = JSON.parse(readPreference(HIDDEN_APPS_KEY, ['utilityx-hidden-apps-v1'], '[]'));
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function formatReminder(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function AppIcon({ app }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-white/[0.08] bg-white/[0.045] text-[12px] font-semibold text-[#D8DBD5]">
      {app.icon && !failed ? <img src={app.icon} alt="" className="h-full w-full object-contain" onError={() => setFailed(true)} /> : app.name.trim().charAt(0).toUpperCase()}
    </div>
  );
}

export default function AppsTab({ onCollapse }) {
  const [innerTab, setInnerTab] = useState('pc');
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [preferences, setPreferences] = useState(readPreferences);
  const [hiddenAppIds, setHiddenAppIds] = useState(readHiddenApps);
  const [editingId, setEditingId] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [draftReminder, setDraftReminder] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    try {
      const cached = JSON.parse(readPreference(APPS_CACHE_KEY, ['utilityx-installed-apps-cache-v1'], 'null'));
      if (Array.isArray(cached)) {
        setApps(cached);
        setLoading(false);
        return () => { active = false; };
      }
    } catch {}
    invokeTauriStrict('apps_list_installed')
      .then((result) => { if (active) { const list = Array.isArray(result) ? result : []; setApps(list); setLoadError(''); try { localStorage.setItem(APPS_CACHE_KEY, JSON.stringify(list)); } catch {} } })
      .catch((error) => { if (active) setLoadError(error?.message || String(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(preferences)); } catch {}
  }, [preferences]);

  useEffect(() => {
    try { localStorage.setItem(HIDDEN_APPS_KEY, JSON.stringify(hiddenAppIds)); } catch {}
  }, [hiddenAppIds]);

  useEffect(() => {
    if (loading) return;
    const due = Object.entries(preferences).filter(([, pref]) => pref?.reminder && !pref.reminderNotified && new Date(pref.reminder).getTime() <= Date.now());
    if (!due.length) return;
    const appNames = new Map(apps.map((app) => [app.id, app.name]));
    setNotice(due.map(([appId, pref]) => `${appNames.get(appId) || 'App'}: ${pref.note?.trim() || 'Reminder due'}`).join(' · '));
    setPreferences((current) => due.reduce((next, [appId]) => ({
      ...next,
      [appId]: { ...next[appId], reminderNotified: true },
    }), current));
  }, [apps, loading, preferences]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 7000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const sortedApps = useMemo(() => apps
    .filter((app) => app.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })), [apps, search]);
  const visibleApps = sortedApps.filter((app) => !hiddenAppIds.includes(app.id));
  const pinnedApps = visibleApps.filter((app) => preferences[app.id]?.pinned);

  const updatePreference = (id, update) => setPreferences((current) => ({
    ...current,
    [id]: { ...(current[id] || {}), ...update },
  }));

  const togglePin = (app) => updatePreference(app.id, { pinned: !preferences[app.id]?.pinned });

  const hideApp = (app) => {
    setHiddenAppIds((current) => current.includes(app.id) ? current : [...current, app.id]);
    if (editingId === app.id) setEditingId('');
  };

  const restoreApps = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const currentApps = await invokeTauriStrict('apps_refresh_installed');
      setApps(Array.isArray(currentApps) ? currentApps : []);
      try { localStorage.setItem(APPS_CACHE_KEY, JSON.stringify(Array.isArray(currentApps) ? currentApps : [])); } catch {}
      setHiddenAppIds([]);
      setSearch('');
      setNotice(`Restored the current Windows app list (${Array.isArray(currentApps) ? currentApps.length : 0} apps).`);
    } catch (error) {
      setLoadError(error?.message || String(error));
    } finally {
      setLoading(false);
    }
  };

  const openEditor = (app) => {
    if (editingId === app.id) { setEditingId(''); return; }
    setEditingId(app.id);
    setDraftNote(preferences[app.id]?.note || '');
    setDraftReminder(preferences[app.id]?.reminder || '');
  };

  const saveDetails = (app) => {
    updatePreference(app.id, {
      note: draftNote.trim(),
      reminder: draftReminder,
      reminderNotified: false,
    });
    setEditingId('');
    setNotice(draftReminder ? `Saved a reminder for ${app.name}.` : `Saved notes for ${app.name}.`);
  };

  const launchApp = async (app) => {
    try {
      await invokeTauriStrict('apps_launch_app', { id: app.id });
      setNotice(`Opening ${app.name}`);
    } catch (error) {
      setNotice(error?.message || `Windows could not open ${app.name}.`);
    }
  };

  const renderApp = (app) => {
    const pref = preferences[app.id] || {};
    const editing = editingId === app.id;
    const reminder = formatReminder(pref.reminder);
    return (
      <div key={app.id} className="overflow-hidden rounded-[12px] border border-white/[0.08] bg-white/[0.025]">
        <div className="flex min-h-[48px] items-center gap-2 px-2.5 py-1.5">
          <AppIcon app={app} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-semibold text-[#E8E9E3]" title={app.name}>{app.name}</p>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[8px] text-[#858D85]">
              {pref.pinned && <span className="text-[#C5CBC3]">Pinned</span>}
              {pref.note && <span className="truncate">{pref.note}</span>}
              {reminder && <span className="flex shrink-0 items-center gap-0.5"><Bell className="h-2.5 w-2.5" />{reminder}</span>}
              {!pref.pinned && !pref.note && !reminder && <span>{app.launchable ? 'Installed app' : 'Installed · no launch action'}</span>}
            </div>
          </div>
          <button type="button" onClick={() => togglePin(app)} aria-label={pref.pinned ? `Unpin ${app.name}` : `Pin ${app.name}`} title={pref.pinned ? 'Unpin app' : 'Pin app'} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] transition-colors ${pref.pinned ? 'bg-white/[0.11] text-white' : 'text-[#929990] hover:bg-white/[0.07] hover:text-white'}`}>
            {pref.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </button>
          <button type="button" onClick={() => openEditor(app)} aria-label={`Add notes or reminder for ${app.name}`} title="Notes and reminders" className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] transition-colors ${editing ? 'bg-white/[0.11] text-white' : 'text-[#929990] hover:bg-white/[0.07] hover:text-white'}`}>
            <StickyNote className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => hideApp(app)} aria-label={`Hide ${app.name} from this list`} title="Hide from this list" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-[#929990] transition-colors hover:bg-white/[0.07] hover:text-white"><EyeOff className="h-3.5 w-3.5" /></button>
          <button type="button" disabled={!app.launchable} onClick={() => launchApp(app)} title={app.launchable ? `Open ${app.name}` : 'Windows does not provide a launch target'} className="flex h-7 shrink-0 items-center gap-1 rounded-[8px] border border-white/[0.08] px-2 text-[9px] font-medium text-[#D5D9D2] transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35">
            <ExternalLink className="h-3 w-3" />Open
          </button>
        </div>
        {editing && (
          <div className="border-t border-white/[0.07] bg-black/25 px-2.5 py-2.5">
            <label className="block text-[9px] font-medium text-[#C9CEC7]">Note</label>
            <textarea value={draftNote} onChange={(event) => setDraftNote(event.target.value)} maxLength={500} rows={2} placeholder={`Remember something about ${app.name}…`} className="mt-1 w-full resize-none rounded-[9px] border border-white/[0.08] bg-white/[0.035] px-2.5 py-2 text-[10px] text-white outline-none placeholder:text-[#666E66] focus:border-white/20" />
            <div className="mt-2 flex items-end justify-between gap-3">
              <label className="min-w-0 flex-1 text-[9px] font-medium text-[#C9CEC7]">Reminder time
                <input type="datetime-local" value={draftReminder} onChange={(event) => setDraftReminder(event.target.value)} className="mt-1 block w-full rounded-[9px] border border-white/[0.08] bg-[#0A0A0A] px-2 py-1.5 text-[9px] text-white outline-none focus:border-white/20" />
              </label>
              <div className="flex shrink-0 items-center gap-1.5">
                {draftReminder && <button type="button" onClick={() => setDraftReminder('')} className="rounded-[8px] px-2 py-1.5 text-[9px] text-[#9BA199] hover:bg-white/[0.06]">Clear time</button>}
                <button type="button" onClick={() => saveDetails(app)} className="flex items-center gap-1 rounded-[8px] bg-[#F5F7FF] px-2.5 py-1.5 text-[9px] font-semibold text-black"><Check className="h-3 w-3" />Save</button>
              </div>
            </div>
            <p className="mt-1.5 flex items-center gap-1 text-[8px] text-[#707870]"><Info className="h-2.5 w-2.5" />Reminders appear in Ollumi while it is running; notes and times are saved on this PC.</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 text-[#E8E9E3]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold tracking-[-0.02em]">Applications</p>
          <p className="mt-0.5 truncate text-[9px] text-[#828A82]">Your apps, pinned and ready.</p>
        </div>
        <div className="flex rounded-full border border-white/[0.08] bg-white/[0.025] p-0.5">
          <button type="button" onClick={() => setInnerTab('pc')} className={`rounded-full px-3 py-1.5 text-[9px] font-medium transition-colors ${innerTab === 'pc' ? 'bg-[#F5F7FF] text-black' : 'text-[#929990] hover:text-white'}`}>This PC</button>
          <button type="button" onClick={() => setInnerTab('android')} className={`rounded-full px-3 py-1.5 text-[9px] font-medium transition-colors ${innerTab === 'android' ? 'bg-[#F5F7FF] text-black' : 'text-[#929990] hover:text-white'}`}>Android</button>
        </div>
      </div>

      {notice && <motion.div initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} className="rounded-[9px] border border-white/[0.09] bg-white/[0.05] px-3 py-1.5 text-[9px] text-[#DDE1D9]">{notice}</motion.div>}

      {innerTab === 'android' ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-[16px] border border-dashed border-white/[0.1] bg-white/[0.015] px-8 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-white/[0.09] bg-white/[0.04]"><Smartphone className="h-5 w-5 text-[#D4D8D1]" /></span>
          <p className="mt-3 text-[12px] font-semibold text-[#E4E7E0]">Android apps</p>
          <p className="mt-1.5 max-w-[300px] text-[10px] leading-4 text-[#858D85]">Will be implemented with the Ollumi phone companion. Connect your phone to open and manage its apps here.</p>
          <span className="mt-3 rounded-full border border-white/[0.08] bg-white/[0.035] px-2.5 py-1 text-[8px] uppercase tracking-[0.12em] text-[#969D95]">Coming with Phone Companion</span>
        </div>
      ) : (
        <>
          <div className="flex h-8 shrink-0 items-center gap-2 rounded-[10px] border border-white/[0.08] bg-white/[0.025] px-2.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-[#848C84]" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search installed apps" className="min-w-0 flex-1 bg-transparent text-[10px] text-white outline-none placeholder:text-[#697169]" />
            <span className="shrink-0 text-[8px] text-[#737B73]">{loading ? 'Scanning…' : `${visibleApps.length} / ${apps.length}`}</span>
            <button type="button" onClick={restoreApps} disabled={loading} className="flex shrink-0 items-center gap-1 rounded-[7px] border border-white/[0.08] px-2 py-1 text-[8px] font-medium text-[#BFC5BD] transition-colors hover:bg-white/[0.07] disabled:opacity-40" title="Rescan Windows and restore every hidden app"><RefreshCw className={`h-2.5 w-2.5 ${loading ? 'animate-spin' : ''}`} />Restore</button>
          </div>
          {loadError ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-[14px] border border-white/[0.08] px-5 text-center">
              <p className="text-[10px] font-medium text-[#E5E7E1]">Could not load installed apps</p>
              <p className="mt-1.5 max-w-[440px] break-words text-[9px] leading-4 text-[#8D958D]">{loadError}</p>
              <button type="button" onClick={() => { setLoading(true); setLoadError(''); invokeTauriStrict('apps_refresh_installed').then((result) => { const list = Array.isArray(result) ? result : []; setApps(list); try { localStorage.setItem(APPS_CACHE_KEY, JSON.stringify(list)); } catch {} }).catch((error) => setLoadError(error?.message || String(error))).finally(() => setLoading(false)); }} className="mt-2 rounded-full border border-white/[0.09] px-3 py-1 text-[9px] text-[#CDD1CA] hover:bg-white/[0.05]">Retry</button>
            </div>
          ) : loading ? (
            <div className="flex flex-1 items-center justify-center text-[10px] text-[#828A82]">Reading Windows app list…</div>
          ) : (
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {pinnedApps.length > 0 && <section><div className="mb-1 flex items-center gap-1.5 px-0.5 text-[8px] font-semibold uppercase tracking-[0.13em] text-[#828A82]"><Pin className="h-2.5 w-2.5" />Pinned</div><div className="space-y-1">{pinnedApps.map(renderApp)}</div></section>}
              <section><div className="mb-1 flex items-center justify-between px-0.5 text-[8px] font-semibold uppercase tracking-[0.13em] text-[#828A82]"><span>All apps · A–Z</span><span>{visibleApps.length}</span></div>
                {visibleApps.length ? <div className="space-y-1">{visibleApps.map(renderApp)}</div> : <p className="rounded-[10px] border border-white/[0.07] px-3 py-4 text-center text-[9px] text-[#7E867E]">{apps.length ? 'No visible apps match your search. Use Restore to bring back hidden apps.' : 'Windows did not report any installed apps.'}</p>}
              </section>
            </div>
          )}
        </>
      )}

      <div className="flex shrink-0 justify-center border-t border-white/[0.06] pt-1.5">
        <button type="button" onClick={onCollapse} className="flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1 text-[9px] font-medium text-[#9AA199] transition-colors hover:bg-white/[0.07] hover:text-white"><ChevronUp className="h-3 w-3" /><span>Minimize</span></button>
      </div>
    </div>
  );
}
