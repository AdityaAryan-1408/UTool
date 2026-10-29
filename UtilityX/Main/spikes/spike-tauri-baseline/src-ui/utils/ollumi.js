export const THEMES = [
  { id: 'neon-white', label: 'Luminary White', color: '#F5F7FF', muted: 'rgba(245, 247, 255, 0.15)', glow: 'rgba(245, 247, 255, 0.25)', note: 'Obsidian black with crisp white radiance' },
  { id: 'cyber-cyan', label: 'Electric Cyan', color: '#00F2FE', muted: 'rgba(0, 242, 254, 0.15)', glow: 'rgba(0, 242, 254, 0.35)', note: 'High-contrast neon glow for late-night focus' },
  { id: 'sunset-amber', label: 'Solar Amber', color: '#F59E0B', muted: 'rgba(245, 158, 11, 0.15)', glow: 'rgba(245, 158, 11, 0.30)', note: 'Warm golden tones for dusk and night light' },
  { id: 'emerald-mint', label: 'Nordic Emerald', color: '#10B981', muted: 'rgba(16, 185, 129, 0.15)', glow: 'rgba(16, 185, 129, 0.30)', note: 'Calm restorative sage and mint accents' },
  { id: 'violet-aurora', label: 'Cosmic Violet', color: '#A855F7', muted: 'rgba(168, 85, 247, 0.15)', glow: 'rgba(168, 85, 247, 0.35)', note: 'Deep violet with an ultraviolet sheen' },
];

const EVENT_ALIASES = new Map([
  ['ollumi-clipboard-history-updated', 'utilityx-clipboard-history-updated'],
  ['ollumi-screen-capture-closed', 'utilityx-screen-capture-closed'],
  ['ollumi-circle-search', 'utilityx-circle-search'],
  ['ollumi-screen-capture', 'utilityx-screen-capture'],
  ['ollumi-screenshot-added', 'utilityx-screenshot-added'],
  ['ollumi-shelf-drag-enter', 'utilityx-shelf-drag-enter'],
  ['ollumi-shelf-files-dropped', 'utilityx-shelf-files-dropped'],
  ['ollumi-shelf-drop-error', 'utilityx-shelf-drop-error'],
  ['ollumi-shelf-paste-empty', 'utilityx-shelf-paste-empty'],
]);

export function readPreference(key, legacyKeys = [], fallback = null) {
  try {
    const current = localStorage.getItem(key);
    if (current !== null) return current;
    for (const legacyKey of legacyKeys) {
      const legacy = localStorage.getItem(legacyKey);
      if (legacy !== null) {
        localStorage.setItem(key, legacy);
        return legacy;
      }
    }
  } catch {}
  return fallback;
}

export function writePreference(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

export function listenOllumiEvent(name, handler) {
  const legacy = EVENT_ALIASES.get(name);
  window.addEventListener(name, handler);
  if (legacy) window.addEventListener(legacy, handler);
  return () => {
    window.removeEventListener(name, handler);
    if (legacy) window.removeEventListener(legacy, handler);
  };
}

export function dispatchOllumiEvent(name, detail) {
  window.dispatchEvent(detail === undefined ? new Event(name) : new CustomEvent(name, { detail }));
}
