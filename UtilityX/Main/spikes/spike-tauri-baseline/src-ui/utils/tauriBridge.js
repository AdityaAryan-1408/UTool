export const isTauri = typeof window !== 'undefined' && (
  Boolean(window.__TAURI_INTERNALS__) || 
  Boolean(window.__TAURI__) ||
  window.location.hostname === 'tauri.localhost' ||
  window.location.protocol === 'tauri:'
);

export async function invokeTauri(cmd, args = {}) {
  if (typeof window !== 'undefined') {
    if (window.__TAURI_INTERNALS__?.invoke) {
      try {
        return await window.__TAURI_INTERNALS__.invoke(cmd, args);
      } catch (err) {
        console.warn(`[Tauri] ${cmd} error:`, err);
      }
    }
  }
  return null;
}

export async function invokeTauriStrict(cmd, args = {}) {
  if (typeof window === 'undefined' || !window.__TAURI_INTERNALS__?.invoke) {
    throw new Error('This control is available in the native UtilityX app.');
  }
  return window.__TAURI_INTERNALS__.invoke(cmd, args);
}
