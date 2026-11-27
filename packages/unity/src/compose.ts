import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { copyPath } from '@gamedream/core';
import { fileURLToPath } from 'node:url';

const SHARED_BGM_PLAYER = fileURLToPath(new URL('../assets/BgmPlayer.cs', import.meta.url));
const SHARED_ASSET_BINDING = fileURLToPath(new URL('../assets/AssetBinding.cs', import.meta.url));

export const UNITY_PROJECT_FILES = [
  'ProjectSettings/ProjectVersion.txt',
  'ProjectSettings/EditorBuildSettings.asset',
  'Packages/manifest.json',
  'Assets/Scenes/Main.unity',
  'Assets/Scenes/Main.unity.meta',
  'Assets/Scripts/GameConfig.cs',
  'Assets/Scripts/GameSim.cs',
  'Assets/Scripts/BgmPlayer.cs',
  'Assets/Scripts/AssetBinding.cs',
  'Assets/Scripts/GameBootstrap.cs',
  'Assets/Scripts/ScreenshotRunner.cs',
  'Assets/Scripts/SmokeRunner.cs',
  'Assets/Scripts/SaveStore.cs',
  'Assets/Editor/EditorVerifier.cs',
  'Assets/Editor/ProjectBuilder.cs',
  'Assets/Editor/ScreenshotCapture.cs',
  'Assets/Resources/GameConfig.json',
  'README.md',
] as const;

export interface UnityMap {
  rows: string[];
  tile_size: number;
  tileset: { floor: string; wall: string };
}

export interface UnityEnemy {
  kind: string;
  max_hp: number;
  attack_damage: number;
  attack_range: number;
  attack_cooldown: number;
  speed: number;
  x: number;
  y: number;
  scale: number;
}

export interface UnityLevel {
  id: string;
  name: string;
  map: UnityMap | null;
  enemy: UnityEnemy;
}

export interface UnityQuest {
  id: string;
  title: string;
  type: string;
  target: string;
  count: number;
}

export interface UnityItemBonus {
  attack_damage: number;
  max_hp: number;
}

export interface UnityItem {
  id: string;
  name: string;
  slot: string;
  bonuses: UnityItemBonus;
}

export interface UnityLootDrop {
  item_id: string;
  chance: number;
}

export interface UnityLootTable {
  id: string;
  drops: UnityLootDrop[];
}

export interface UnityGameConfig {
  name: string;
  arena: { width: number; height: number };
  player: { hp: number; damage: number; speed: number; attack_range: number };
  enemy: { hp: number; damage: number; speed: number; attack_range: number };
  levels?: UnityLevel[];
  quests?: UnityQuest[];
  items?: UnityItem[];
  loot?: UnityLootTable[];
}

export interface ComposeUnityOptions {
  outDir: string;
  templatesDir?: string;
  contentDir?: string;
  name?: string;
  force?: boolean;
  config?: Partial<UnityGameConfig>;
}

export interface ComposeUnityResult {
  outDir: string;
  files: string[];
  config: UnityGameConfig;
}

const DEFAULT_CONFIG: UnityGameConfig = {
  name: 'unity-m0',
  arena: { width: 960, height: 540 },
  player: { hp: 100, damage: 15, speed: 220, attack_range: 64 },
  enemy: { hp: 30, damage: 5, speed: 70, attack_range: 40 },
};

function readJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`invalid Unity project JSON ${path}: ${(error as Error).message}`);
  }
}

function finite(value: unknown, name: string, fallback: number): number {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(number)) throw new Error(`invalid Unity content: ${name} is not a number`);
  return number;
}

function readUnityMap(path: string): UnityMap {
  const raw = readJson(path);
  if (!Array.isArray(raw.rows) || raw.rows.length === 0) {
    throw new Error(`invalid Unity content: ${path} has no rows`);
  }
  const rows = raw.rows.map((row) => String(row));
  if (rows.some((row) => row.length !== rows[0].length)) {
    throw new Error(`invalid Unity content: ${path} has ragged rows`);
  }
  const tileset = (raw.tileset ?? {}) as Record<string, unknown>;
  if (typeof tileset.floor !== 'string' || typeof tileset.wall !== 'string') {
    throw new Error(`invalid Unity content: ${path} has no tileset colors`);
  }
  return {
    rows,
    tile_size: finite(raw.tile_size, `${path}.tile_size`, 32),
    tileset: { floor: tileset.floor, wall: tileset.wall },
  };
}

export function readUnityContent(contentDir: string): {
  levels: UnityLevel[];
  quests: UnityQuest[];
  items: UnityItem[];
  loot: UnityLootTable[];
} {
  const campaignPath = join(contentDir, 'levels/campaign.json');
  const campaign = readJson(campaignPath);
  if (!Array.isArray(campaign.levels) || campaign.levels.length === 0) {
    throw new Error(`invalid Unity content: ${campaignPath} has no levels`);
  }
  const levels = campaign.levels.map((value) => {
    if (typeof value !== 'object' || value === null) {
      throw new Error(`invalid Unity content: campaign contains a non-object level`);
    }
    const level = value as Record<string, unknown>;
    const mapId = String(level.map ?? '');
    if (!/^[A-Za-z0-9_-]+$/.test(mapId)) {
      throw new Error(`invalid Unity content: bad map id ${mapId}`);
    }
    const enemy = (level.enemy ?? {}) as Record<string, unknown>;
    return {
      id: String(level.id ?? mapId),
      name: String(level.name ?? mapId),
      map: readUnityMap(join(contentDir, 'maps', `${mapId}.json`)),
      enemy: {
        kind: String(enemy.kind ?? 'slime'),
        max_hp: finite(enemy.max_hp, 'enemy.max_hp', 30),
        attack_damage: finite(enemy.attack_damage, 'enemy.attack_damage', 5),
        attack_range: finite(enemy.attack_range, 'enemy.attack_range', 40),
        attack_cooldown: finite(enemy.attack_cooldown, 'enemy.attack_cooldown', 1),
        speed: finite(enemy.speed, 'enemy.speed', 80),
        x: finite(enemy.x, 'enemy.x', 600),
        y: finite(enemy.y, 'enemy.y', 240),
        scale: finite(enemy.scale, 'enemy.scale', 1),
      },
    };
  });

  const quests: UnityQuest[] = [];
  const questDir = join(contentDir, 'quests');
  if (existsSync(questDir)) {
    for (const file of readdirSync(questDir).filter((name) => name.endsWith('.json'))) {
      const quest = readJson(join(questDir, file));
      const objective = (quest.objective ?? {}) as Record<string, unknown>;
      quests.push({
        id: String(quest.id ?? file.replace(/\.json$/, '')),
        title: String(quest.title ?? quest.id ?? file),
        type: String(objective.type ?? 'kill'),
        target: String(objective.target ?? ''),
        count: finite(objective.count, 'quest.count', 1),
      });
    }
  }
  const items: UnityItem[] = [];
  const itemIds = new Set<string>();
  const itemDir = join(contentDir, 'items');
  if (existsSync(itemDir)) {
    for (const file of readdirSync(itemDir).filter((name) => name.endsWith('.json'))) {
      const item = readJson(join(itemDir, file));
      const id = String(item.id ?? file.replace(/\.json$/, ''));
      const bonuses = (item.bonuses ?? {}) as Record<string, unknown>;
      items.push({
        id,
        name: String(item.name ?? id),
        slot: String(item.slot ?? ''),
        bonuses: {
          attack_damage: finite(bonuses.attack_damage, 'item.bonus.attack_damage', 0),
          max_hp: finite(bonuses.max_hp, 'item.bonus.max_hp', 0),
        },
      });
      itemIds.add(id);
    }
  }

  const loot: UnityLootTable[] = [];
  const lootDir = join(contentDir, 'loot');
  if (existsSync(lootDir)) {
    for (const file of readdirSync(lootDir).filter((name) => name.endsWith('.json'))) {
      const table = readJson(join(lootDir, file));
      const id = String(table.id ?? file.replace(/\.json$/, ''));
      const drops = Array.isArray(table.drops) ? table.drops : [];
      const parsed = drops.map((drop) => {
        const raw = drop as Record<string, unknown>;
        const itemId = String(raw.item_id ?? '');
        if (!itemIds.has(itemId)) {
          throw new Error(`invalid Unity content: loot ${id} references unknown item ${itemId}`);
        }
        return { item_id: itemId, chance: finite(raw.chance, 'loot.chance', 0) };
      });
      loot.push({ id, drops: parsed });
    }
  }
  for (const kind of new Set(levels.map((level) => level.enemy.kind))) {
    const table = loot.find((entry) => entry.id === kind);
    if (!table || table.drops.length === 0) {
      throw new Error(`invalid Unity content: no loot table for enemy kind ${kind}`);
    }
  }
  return { levels, quests, items, loot };
}

export function composeUnityProject(options: ComposeUnityOptions): ComposeUnityResult {
  const templatesDir = resolve(
    options.templatesDir ?? join(process.cwd(), 'templates/unity-2d-m0'),
  );
  if (!existsSync(templatesDir)) {
    throw new Error(`Unity template directory not found: ${templatesDir}`);
  }
  const outDir = resolve(options.outDir);
  if (
    outDir === templatesDir ||
    outDir.startsWith(templatesDir + sep) ||
    templatesDir.startsWith(outDir + sep)
  ) {
    throw new Error('Unity output must not be the template directory or its parent');
  }
  if (existsSync(outDir)) {
    if (!statSync(outDir).isDirectory()) {
      throw new Error(`Unity output path is not a directory: ${outDir}`);
    }
    if (readdirSync(outDir).length > 0 && !options.force) {
      throw new Error(`refusing to overwrite non-empty ${outDir}; pass --force`);
    }
  }

  const embedded = options.contentDir
    ? readUnityContent(options.contentDir)
    : null;
  const config: UnityGameConfig = {
    ...DEFAULT_CONFIG,
    ...options.config,
    ...(embedded
      ? {
          levels: embedded.levels,
          quests: embedded.quests,
          items: embedded.items,
          loot: embedded.loot,
        }
      : {}),
    name: options.name ?? options.config?.name ?? DEFAULT_CONFIG.name,
    arena: { ...DEFAULT_CONFIG.arena, ...options.config?.arena },
    player: { ...DEFAULT_CONFIG.player, ...options.config?.player },
    enemy: { ...DEFAULT_CONFIG.enemy, ...options.config?.enemy },
  };
  const stage = `${outDir}.tmp-${process.pid}-${Date.now()}`;
  rmSync(stage, { recursive: true, force: true });
  try {
    mkdirSync(stage, { recursive: true });
    copyPath(templatesDir, stage);
    copyPath(SHARED_BGM_PLAYER, join(stage, 'Assets/Scripts/BgmPlayer.cs'));
    copyPath(`${SHARED_BGM_PLAYER}.meta`, join(stage, 'Assets/Scripts/BgmPlayer.cs.meta'));
    copyPath(SHARED_ASSET_BINDING, join(stage, 'Assets/Scripts/AssetBinding.cs'));
    copyPath(`${SHARED_ASSET_BINDING}.meta`, join(stage, 'Assets/Scripts/AssetBinding.cs.meta'));
    const missing = UNITY_PROJECT_FILES.filter(
      (file) => file !== 'Assets/Resources/GameConfig.json' && !existsSync(join(stage, file)),
    );
    if (missing.length > 0) {
      throw new Error(`Unity template is incomplete: missing ${missing.join(', ')}`);
    }
    mkdirSync(join(stage, 'Assets/Resources'), { recursive: true });
    writeFileSync(
      join(stage, 'Assets/Resources/GameConfig.json'),
      `${JSON.stringify(config, null, 2)}\n`,
      'utf8',
    );
    const backup = `${outDir}.bak-${process.pid}-${Date.now()}`;
    if (existsSync(outDir)) renameSync(outDir, backup);
    try {
      renameSync(stage, outDir);
      rmSync(backup, { recursive: true, force: true });
    } catch (error) {
      rmSync(outDir, { recursive: true, force: true });
      if (existsSync(backup)) renameSync(backup, outDir);
      throw error;
    }
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }
  return { outDir, files: [...UNITY_PROJECT_FILES], config };
}

export function readUnityConfig(projectDir: string): UnityGameConfig {
  const path = join(projectDir, 'Assets/Resources/GameConfig.json');
  return readJson(path) as unknown as UnityGameConfig;
}
