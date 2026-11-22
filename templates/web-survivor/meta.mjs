export const META_VERSION = 1;
export const META_KEY = 'gamedream-survivor-meta';

export function defaultMeta() {
  return { version: META_VERSION, coins: 0, damage: 0, maxHp: 0, runs: 0, wins: 0 };
}

function finiteInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

export function normalizeMeta(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  return {
    version: META_VERSION,
    coins: finiteInt(value.coins),
    damage: finiteInt(value.damage),
    maxHp: finiteInt(value.maxHp),
    runs: finiteInt(value.runs),
    wins: finiteInt(value.wins),
  };
}

export function readMeta(storage, key = META_KEY) {
  try {
    const raw = storage?.getItem(key);
    return raw ? normalizeMeta(JSON.parse(raw)) : defaultMeta();
  } catch {
    return defaultMeta();
  }
}

export function writeMeta(storage, meta, key = META_KEY) {
  const normalized = normalizeMeta(meta);
  try {
    storage?.setItem(key, JSON.stringify(normalized));
  } catch {
    // Storage can be unavailable in private contexts.
  }
  return normalized;
}

export function upgradeMeta(meta, kind, cost = 5) {
  const next = normalizeMeta(meta);
  if (next.coins < cost) return next;
  next.coins -= cost;
  if (kind === 'damage') next.damage += 1;
  else if (kind === 'hp') next.maxHp += 10;
  return next;
}

export function grantMeta(meta, state) {
  const next = normalizeMeta(meta);
  next.coins += Math.max(0, Math.floor(state?.coins ?? 0));
  next.runs += 1;
  if (state?.finished === 'win') next.wins += 1;
  return next;
}
