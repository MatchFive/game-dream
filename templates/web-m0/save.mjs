import { startLevel } from './sim.mjs';

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'gamedream-save';

export function saveKeyFor(config) {
  const identity = JSON.stringify({
    levels: (config.levels ?? []).map((level) => level.id),
    quests: (config.quests ?? []).map((quest) => quest.id),
  });
  let hash = 2166136261;
  for (let i = 0; i < identity.length; i += 1) {
    hash ^= identity.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `gamedream:${config.name}:${(hash >>> 0).toString(36)}:save`;
}

export function snapshot(state) {
  return {
    version: SAVE_VERSION,
    game: state.config?.name,
    level: state.levelIndex,
    hp: state.player.hp,
    inventory: { ...state.inventory },
    quests: state.quests.map((quest) => ({
      id: quest.id,
      progress: quest.progress,
      completed: quest.completed,
    })),
  };
}

function validSave(state, save) {
  if (!save || typeof save !== 'object' || save.version !== SAVE_VERSION) return false;
  if (
    !Number.isInteger(save.level) ||
    save.level < 0 ||
    save.level >= state.levels.length ||
    !Number.isFinite(save.hp) ||
    save.hp <= 0
  ) {
    return false;
  }
  if (!save.inventory || typeof save.inventory !== 'object') return false;
  if (!Array.isArray(save.quests)) return false;
  return true;
}

export function restoreState(state, save) {
  if (!validSave(state, save) || save.game !== state.config?.name) return false;
  startLevel(state, save.level);
  state.player.hp = Math.min(state.config.player.hp, Math.max(1, save.hp));
  state.inventory = {};
  for (const [name, count] of Object.entries(save.inventory)) {
    if (typeof count === 'number' && Number.isFinite(count) && count > 0) {
      state.inventory[name] = Math.floor(count);
    }
  }
  for (const saved of save.quests) {
    const quest = state.quests.find((candidate) => candidate.id === saved?.id);
    if (!quest) continue;
    const progress = Number.isFinite(saved.progress) ? Math.max(0, Math.floor(saved.progress)) : 0;
    quest.progress = Math.min(quest.count, progress);
    quest.completed = quest.progress >= quest.count;
  }
  state.finished = null;
  return true;
}

export function resetState(state) {
  startLevel(state, 0);
  state.bossPhase = false;
  state.lootRng = 42;
  state.inventory = {};
  state.finished = null;
  for (const quest of state.quests) {
    quest.progress = 0;
    quest.completed = false;
  }
  return state;
}

export function readSave(storage, key = SAVE_KEY) {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeSave(storage, key = SAVE_KEY, state) {
  if (state === undefined && key && typeof key === 'object') {
    state = key;
    key = SAVE_KEY;
  }
  try {
    const result = storage?.setItem(key, JSON.stringify(snapshot(state)));
    return result !== false;
  } catch {
    return false;
  }
}

export function clearSave(storage, key = SAVE_KEY) {
  try {
    return storage?.removeItem(key) !== false;
  } catch {
    return false;
  }
}

export function loadState(storage, key, state) {
  const save = readSave(storage, key);
  if (!save || !restoreState(state, save)) {
    clearSave(storage, key);
    return false;
  }
  return true;
}
