export const SETTINGS_KEY = 'gamedream-settings';
export const DEFAULT_SETTINGS = Object.freeze({ music: 0.35, sfx: 0.7, fullscreen: false });

function clamp(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(1, Math.max(0, number));
}

export function normalizeSettings(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  return {
    music: clamp(value.music, DEFAULT_SETTINGS.music),
    sfx: clamp(value.sfx, DEFAULT_SETTINGS.sfx),
    fullscreen: typeof value.fullscreen === 'boolean' ? value.fullscreen : DEFAULT_SETTINGS.fullscreen,
  };
}

export function readSettings(storage, key = SETTINGS_KEY) {
  try {
    const raw = storage?.getItem(key);
    return raw ? normalizeSettings(JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSettings(storage, settings, key = SETTINGS_KEY) {
  const normalized = normalizeSettings(settings);
  try {
    storage?.setItem(key, JSON.stringify(normalized));
  } catch {
    // Storage can be unavailable in private contexts.
  }
  return normalized;
}
