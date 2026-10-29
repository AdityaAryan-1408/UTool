import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronUp,
  Circle,
  Cloud,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudSun,
  LoaderCircle,
  MapPin,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sun,
  Trash2,
  Wind,
  Zap,
} from 'lucide-react';
import { readPreference } from '../../utils/ollumi';
import { getNotchGreeting } from '../../utils/notchGreeting';
import ollumiIcon from '../../assets/ollumi-icon.png';

const TODO_STORAGE_KEY = 'ollumi-today-todos';
const NOTES_STORAGE_KEY = 'ollumi-today-note';
const TIMER_STORAGE_KEY = 'ollumi-today-focus-timer';
const WEATHER_LOCATION_KEY = 'ollumi-today-weather-location';
const LEGACY_KEYS = {
  [TODO_STORAGE_KEY]: 'utilityx-today-todos',
  [NOTES_STORAGE_KEY]: 'utilityx-today-note',
  [TIMER_STORAGE_KEY]: 'utilityx-today-focus-timer',
  [WEATHER_LOCATION_KEY]: 'utilityx-today-weather-location',
};
const FOCUS_PRESETS = [25, 50];

function readStored(key, fallback) {
  try {
    const value = readPreference(key, [LEGACY_KEYS[key]].filter(Boolean), null);
    return value === null ? fallback : JSON.parse(value);
  } catch { return fallback; }
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeek(date) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return day;
  });
}

function loadTimer() {
  const saved = readStored(TIMER_STORAGE_KEY, {});
  const duration = FOCUS_PRESETS.includes(saved.duration) ? saved.duration * 60 : 25 * 60;
  let remaining = Number.isFinite(saved.remaining) ? Math.max(0, saved.remaining) : duration;
  let running = Boolean(saved.running && saved.endsAt);
  if (running) remaining = Math.max(0, Math.ceil((saved.endsAt - Date.now()) / 1000));
  if (remaining === 0) running = false;
  return { duration, remaining, running, endsAt: running ? saved.endsAt : null };
}

function weatherDescription(code) {
  if (code === 0) return 'Clear sky';
  if ([1, 2].includes(code)) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([95, 96, 99].includes(code)) return 'Thunderstorm';
  return 'Current conditions';
}

function WeatherIcon({ code, className, style }) {
  if ([0, 1].includes(code)) return <Sun className={className} style={style} />;
  if (code === 2) return <CloudSun className={className} style={style} />;
  if ([51, 53, 55, 56, 57].includes(code)) return <CloudDrizzle className={className} style={style} />;
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return <CloudRain className={className} style={style} />;
  if ([71, 73, 75, 77, 85, 86].includes(code)) return <CloudSnow className={className} style={style} />;
  if ([95, 96, 99].includes(code)) return <Zap className={className} style={style} />;
  return <Cloud className={className} style={style} />;
}

function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

async function fetchWeather(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: `${latitude}`,
    longitude: `${longitude}`,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
    timezone: 'auto',
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error(`Weather service returned ${response.status}.`);
  const result = await response.json();
  if (!result.current) throw new Error('Current weather is unavailable for this location.');
  return result.current;
}

export default function TodayTab({ onCollapse, accent, displayName = '' }) {
  const [now, setNow] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [todos, setTodos] = useState(() => {
    const stored = readStored(TODO_STORAGE_KEY, []);
    return Array.isArray(stored) ? stored.filter((item) => item && item.id && item.text && item.date) : [];
  });
  const [newTodo, setNewTodo] = useState('');
  const [note, setNote] = useState(() => {
    const saved = readStored(NOTES_STORAGE_KEY, '');
    return typeof saved === 'string' ? saved : '';
  });
  const [timer, setTimer] = useState(loadTimer);
  const [weatherLocation, setWeatherLocation] = useState(() => readStored(WEATHER_LOCATION_KEY, null));
  const [weather, setWeather] = useState(null);
  const [weatherBusy, setWeatherBusy] = useState(false);
  const [weatherError, setWeatherError] = useState('');
  const [locationEditor, setLocationEditor] = useState(false);
  const [locationQuery, setLocationQuery] = useState('');

  const accentColor = accent?.primary || '#F5F7FF';
  const activeTextColor = accent?.activeText || '#000000';
  const greeting = getNotchGreeting(displayName, now);
  const week = useMemo(() => getWeek(now), [now]);
  const selectedTodos = todos.filter((todo) => todo.date === selectedDate);
  const completedCount = selectedTodos.filter((todo) => todo.done).length;
  const nextTodo = selectedTodos.find((todo) => !todo.done);
  const timerProgress = timer.duration ? (1 - timer.remaining / timer.duration) * 100 : 0;

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(todos));
  }, [todos]);

  useEffect(() => {
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(note));
  }, [note]);

  useEffect(() => {
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timer));
  }, [timer]);

  useEffect(() => {
    if (!timer.running || !timer.endsAt) return undefined;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
      setTimer((current) => current.running ? {
        ...current,
        remaining,
        running: remaining > 0,
        endsAt: remaining > 0 ? current.endsAt : null,
      } : current);
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [timer.running, timer.endsAt]);

  useEffect(() => {
    if (!weatherLocation) return undefined;
    let cancelled = false;
    const updateWeather = async () => {
      setWeatherBusy(true);
      setWeatherError('');
      try {
        const current = await fetchWeather(weatherLocation.latitude, weatherLocation.longitude);
        if (!cancelled) setWeather(current);
      } catch (error) {
        if (!cancelled) setWeatherError(error?.message || 'Could not load weather.');
      } finally {
        if (!cancelled) setWeatherBusy(false);
      }
    };
    updateWeather();
    const interval = window.setInterval(updateWeather, 30 * 60 * 1000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [weatherLocation]);

  const toggleTodo = (id) => {
    setTodos((current) => current.map((todo) => todo.id === id ? { ...todo, done: !todo.done } : todo));
  };

  const removeTodo = (id) => setTodos((current) => current.filter((todo) => todo.id !== id));

  const addTodo = () => {
    const text = newTodo.trim();
    if (!text) return;
    setTodos((current) => [{ id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, text, date: selectedDate, done: false }, ...current]);
    setNewTodo('');
  };

  const saveWeatherLocation = async (event) => {
    event.preventDefault();
    const query = locationQuery.trim();
    if (!query) return;
    setWeatherBusy(true);
    setWeatherError('');
    try {
      const params = new URLSearchParams({ name: query, count: '1', language: 'en', format: 'json' });
      const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
      if (!response.ok) throw new Error(`Location service returned ${response.status}.`);
      const result = await response.json();
      const place = result.results?.[0];
      if (!place) throw new Error('No matching city found. Try adding a region or country.');
      const nextLocation = {
        name: [place.name, place.admin1, place.country].filter(Boolean).join(', '),
        latitude: place.latitude,
        longitude: place.longitude,
      };
      localStorage.setItem(WEATHER_LOCATION_KEY, JSON.stringify(nextLocation));
      setWeatherLocation(nextLocation);
      setLocationEditor(false);
      setLocationQuery('');
    } catch (error) {
      setWeatherError(error?.message || 'Could not find that location.');
    } finally {
      setWeatherBusy(false);
    }
  };

  const toggleTimer = () => {
    setTimer((current) => {
      if (current.running) {
        const remaining = Math.max(0, Math.ceil((current.endsAt - Date.now()) / 1000));
        return { ...current, remaining, running: false, endsAt: null };
      }
      const remaining = current.remaining || current.duration;
      return { ...current, remaining, running: true, endsAt: Date.now() + remaining * 1000 };
    });
  };

  const resetTimer = () => setTimer((current) => ({ ...current, remaining: current.duration, running: false, endsAt: null }));

  const changeTimerPreset = (minutes) => setTimer({ duration: minutes * 60, remaining: minutes * 60, running: false, endsAt: null });

  const formattedDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(now);
  const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(now);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 text-white">
      <div className="flex h-[58px] shrink-0 items-center gap-3 rounded-2xl border border-white/5 bg-slate-900/60 px-4">
        <img src={ollumiIcon} alt="Ollumi" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-white">Welcome to Ollumi</div>
          <div className="truncate text-[10px] text-slate-400">{greeting.text}</div>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-12 gap-3">
        <div className="col-span-3 flex min-h-0 flex-col gap-3">
          <div className="flex h-[104px] shrink-0 flex-col items-center justify-center rounded-2xl border border-white/5 bg-slate-900/60 text-center">
            <div className="font-mono text-4xl font-extrabold tracking-tight text-white">{clock}</div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{formattedDate}</div>
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col rounded-2xl border border-white/5 bg-slate-900/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-300">Weather</span>
              <button type="button" onClick={() => setLocationEditor((value) => !value)} className="rounded-lg p-1 text-slate-500 hover:bg-white/10 hover:text-white" title="Choose weather location" aria-label="Choose weather location">
                <MapPin className="h-3.5 w-3.5" />
              </button>
            </div>
            {weatherLocation ? (
              <>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-2xl font-bold text-white">{weather ? `${Math.round(weather.temperature_2m)}°` : '—'}</div>
                    <div className="truncate text-[10px] text-slate-400" title={weatherLocation.name}>{weatherLocation.name}</div>
                    <div className="text-[10px] text-slate-300">{weather ? weatherDescription(weather.weather_code) : weatherError || 'Loading conditions…'}</div>
                  </div>
                  {weatherBusy ? <LoaderCircle className="h-5 w-5 animate-spin text-slate-400" /> : weather && <WeatherIcon code={weather.weather_code} className="h-8 w-8 shrink-0" style={{ color: accentColor }} />}
                </div>
                {weather && <div className="mt-auto flex items-center gap-2 pt-2 text-[9px] text-slate-500"><Wind className="h-3 w-3" />{Math.round(weather.wind_speed_10m)} km/h wind <span className="ml-auto">Open-Meteo</span></div>}
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <CloudSun className="mb-2 h-7 w-7 text-slate-600" />
                <span className="text-[10px] text-slate-400">Choose a city for live weather</span>
                <button type="button" onClick={() => setLocationEditor(true)} className="mt-2 rounded-lg px-2 py-1 text-[10px] font-semibold" style={{ backgroundColor: `${accentColor}20`, color: accentColor }}>Set location</button>
              </div>
            )}
            {locationEditor && (
              <form onSubmit={saveWeatherLocation} className="absolute inset-2 z-10 flex flex-col justify-center gap-2 rounded-xl border border-white/10 bg-slate-950 p-3 shadow-xl">
                <div className="text-[11px] font-semibold text-white">Set weather city</div>
                <input autoFocus value={locationQuery} onChange={(event) => setLocationQuery(event.target.value)} placeholder="City, country" className="w-full rounded-lg border border-white/10 bg-black/50 px-2 py-1.5 text-[11px] text-white outline-none focus:border-white/30" />
                {weatherError && <div className="text-[9px] text-rose-300">{weatherError}</div>}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => { setLocationEditor(false); setWeatherError(''); }} className="rounded-lg px-2 py-1 text-[10px] text-slate-400 hover:text-white">Cancel</button>
                  <button type="submit" disabled={weatherBusy} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold disabled:opacity-50" style={{ backgroundColor: accentColor, color: activeTextColor }}>{weatherBusy && <LoaderCircle className="h-3 w-3 animate-spin" />}Save</button>
                </div>
              </form>
            )}
          </div>
        </div>

        <div className="col-span-4 flex min-h-0 flex-col gap-3">
          <div className="rounded-2xl border border-white/5 bg-slate-900/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-300">This week</span>
              <span className="font-mono text-[10px] text-slate-500">{new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(now)}</span>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {week.map((day) => {
                const key = dateKey(day);
                const selected = selectedDate === key;
                const isToday = key === dateKey(now);
                return (
                  <button key={key} type="button" onClick={() => setSelectedDate(key)} aria-pressed={selected} className={`flex flex-col items-center gap-1 rounded-xl py-1.5 text-[9px] transition-colors ${selected ? 'font-bold shadow-md' : 'text-slate-400 hover:bg-white/5'}`} style={selected ? { backgroundColor: accentColor, color: activeTextColor } : {}}>
                    <span>{new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(day)}</span>
                    <span className="text-[11px]">{day.getDate()}</span>
                    <span className={`h-1 w-1 rounded-full ${isToday && !selected ? 'bg-white/70' : selected ? 'bg-black/50' : 'bg-transparent'}`} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/5 bg-slate-900/60 p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold text-white">Focus timer</div>
                <div className="text-[9px] text-slate-500">Timer continues while Ollumi is closed</div>
              </div>
              <select value={timer.duration / 60} onChange={(event) => changeTimerPreset(Number(event.target.value))} disabled={timer.running} aria-label="Focus timer duration" className="rounded-lg border border-white/10 bg-slate-950 px-1.5 py-1 text-[10px] text-slate-300 outline-none disabled:opacity-50">
                {FOCUS_PRESETS.map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
              </select>
            </div>
            <div className="flex flex-1 items-center justify-center gap-4">
              <div className="relative flex h-[74px] w-[74px] items-center justify-center">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
                  <path stroke="currentColor" className="text-slate-800" strokeWidth="3" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path stroke={accentColor} className="transition-all duration-300" strokeDasharray={`${timerProgress}, 100`} strokeWidth="3" strokeLinecap="round" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <span className="absolute font-mono text-sm font-bold text-white">{formatDuration(timer.remaining)}</span>
              </div>
              <div className="flex flex-col gap-2">
                <button type="button" onClick={toggleTimer} className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-bold shadow-md transition-transform hover:scale-105 active:scale-95" style={{ backgroundColor: accentColor, color: activeTextColor }}>
                  {timer.running ? <><Pause className="h-3 w-3" />Pause</> : <><Play className="h-3 w-3" />{timer.remaining === 0 ? 'Start again' : 'Start'}</>}
                </button>
                <button type="button" onClick={resetTimer} className="flex items-center justify-center gap-1 rounded-xl bg-slate-800 px-2 py-1.5 text-[10px] text-slate-400 transition-colors hover:text-white"><RotateCcw className="h-3 w-3" />Reset</button>
              </div>
            </div>
            {timer.remaining === 0 && <div className="text-center text-[10px] font-medium" style={{ color: accentColor }}>Focus block complete</div>}
          </div>
        </div>

        <div className="col-span-5 flex min-h-0 flex-col gap-3">
          <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/5 bg-slate-900/60 p-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <div>
                <div className="text-[11px] font-bold text-white">{selectedDate === dateKey(now) ? 'Today' : new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(new Date(`${selectedDate}T12:00:00`))}</div>
                <div className="text-[9px] text-slate-500">{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${selectedDate}T12:00:00`))}</div>
              </div>
              <span className="font-mono text-[10px] font-bold" style={{ color: accentColor }}>{completedCount}/{selectedTodos.length} done</span>
            </div>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto py-2">
              {selectedTodos.length === 0 ? (
                <div className="flex h-full min-h-16 items-center justify-center text-center text-[10px] text-slate-500">No tasks for this day yet.</div>
              ) : selectedTodos.map((todo) => (
                <div key={todo.id} className="group flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-white/5">
                  <button type="button" onClick={() => toggleTodo(todo.id)} className="shrink-0" aria-label={todo.done ? `Mark ${todo.text} incomplete` : `Complete ${todo.text}`}>
                    {todo.done ? <CheckCircle2 className="h-4 w-4" style={{ color: accentColor }} /> : <Circle className="h-4 w-4 text-slate-500" />}
                  </button>
                  <span className={`min-w-0 flex-1 break-words text-[11px] ${todo.done ? 'text-slate-500 line-through' : 'text-slate-200'}`}>{todo.text}</span>
                  <button type="button" onClick={() => removeTodo(todo.id)} className="rounded-md p-1 text-slate-600 opacity-0 transition-opacity hover:bg-rose-500/10 hover:text-rose-300 group-hover:opacity-100" title="Delete task" aria-label={`Delete ${todo.text}`}><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
            <form onSubmit={(event) => { event.preventDefault(); addTodo(); }} className="flex items-center gap-2 border-t border-white/5 pt-2">
              <Plus className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <input value={newTodo} onChange={(event) => setNewTodo(event.target.value)} placeholder="Add a task for this day" aria-label="New task" className="w-full bg-transparent text-[11px] text-slate-200 outline-none placeholder:text-slate-500" />
              <button type="submit" disabled={!newTodo.trim()} className="rounded-lg px-2 py-1 text-[10px] font-semibold disabled:opacity-30" style={{ color: accentColor }}>Add</button>
            </form>
          </div>

          <div className="flex h-[116px] shrink-0 flex-col rounded-2xl border border-white/5 bg-slate-900/60 p-3">
            <div className="mb-1 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-white">Quick note</div>
                <div className="text-[9px] text-slate-500">Saved on this device · paste replaces the note</div>
              </div>
              <button type="button" onClick={() => setNote('')} disabled={!note} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30" title="Clear note" aria-label="Clear note"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} onPaste={(event) => {
              const pasted = event.clipboardData?.getData('text/plain');
              if (pasted !== undefined) { event.preventDefault(); setNote(pasted); }
            }} placeholder="A reminder that isn't a task…" aria-label="Quick note" className="min-h-0 flex-1 resize-none rounded-lg bg-black/20 px-2 py-1.5 text-[11px] leading-relaxed text-slate-200 outline-none placeholder:text-slate-600 focus:bg-black/30" />
          </div>
        </div>
      </div>

      <div className="flex h-5 shrink-0 items-center justify-between px-1">
        <div className="max-w-[78%] truncate text-[10px] text-slate-500" title={nextTodo?.text}>{nextTodo ? `Up next · ${nextTodo.text}` : 'No unfinished tasks for this day'}</div>
        <button type="button" onClick={onCollapse} className="flex items-center gap-1 rounded-full border border-white/5 bg-white/5 px-3 py-1 text-[10px] font-medium text-slate-400 transition-colors hover:bg-white/10 hover:text-white"><ChevronUp className="h-3 w-3" />Minimize</button>
      </div>
    </div>
  );
}
