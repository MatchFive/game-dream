import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve, sep } from 'node:path';

export const WEB_PROJECT_FILES = [
  'index.html',
  'style.css',
  'sim.mjs',
  'sim-run.mjs',
  'save.mjs',
  'settings.mjs',
  'camera.mjs',
  'game.js',
  'game.json',
  'README.md',
  'vendor/phaser.min.js',
] as const;

export interface WebMap {
  rows: string[];
  tile_size: number;
  tileset: { floor: string; wall: string };
}

export interface WebLevel {
  id: string;
  name: string;
  map: WebMap;
  enemy: {
    kind: string;
    max_hp: number;
    attack_damage: number;
    attack_range: number;
    attack_cooldown: number;
    speed: number;
    x: number;
    y: number;
    scale: number;
  };
}

export interface WebLootDrop {
  item_id: string;
  chance: number;
}

export interface WebQuest {
  id: string;
  title: string;
  type: string;
  target: string;
  count: number;
}

export interface WebGameConfig {
  name: string;
  arena: { width: number; height: number };
  player: {
    hp: number;
    damage: number;
    speed: number;
    attack_range: number;
    attack_cooldown: number;
  };
  enemy: {
    hp: number;
    damage: number;
    speed: number;
    attack_range: number;
    attack_cooldown: number;
  };
  levels?: WebLevel[];
  quests?: WebQuest[];
  sprites?: Record<string, string>;
  items?: Record<string, string>;
  loot?: Record<string, WebLootDrop[]>;
}

export interface ComposeWebOptions {
  outDir: string;
  templatesDir?: string;
  contentDir?: string;
  modulesDir?: string;
  name?: string;
  force?: boolean;
  config?: Partial<WebGameConfig>;
}

export interface ComposeWebResult {
  outDir: string;
  files: string[];
  config: WebGameConfig;
}

interface EmbeddedAsset {
  source: string;
  target: string;
}

interface EmbeddedContent {
  levels?: WebLevel[];
  quests?: WebQuest[];
  sprites?: Record<string, string>;
  items?: Record<string, string>;
  loot?: Record<string, WebLootDrop[]>;
  assets: EmbeddedAsset[];
}

const DEFAULT_CONFIG: WebGameConfig = {
  name: 'web-m0',
  arena: { width: 960, height: 540 },
  player: {
    hp: 100,
    damage: 15,
    speed: 220,
    attack_range: 64,
    attack_cooldown: 0.25,
  },
  enemy: {
    hp: 30,
    damage: 5,
    speed: 70,
    attack_range: 40,
    attack_cooldown: 1,
  },
};

function phaserBundle(): string {
  const require = createRequire(import.meta.url);
  let entry: string;
  try {
    entry = require.resolve('phaser');
  } catch (error) {
    throw new Error(`phaser is not installed: ${(error as Error).message}`);
  }
  const candidates = [
    join(dirname(entry), 'phaser.min.js'),
    join(dirname(entry), '..', 'dist', 'phaser.min.js'),
  ];
  const bundle = candidates.find((candidate) => existsSync(candidate));
  if (!bundle) {
    throw new Error(`phaser bundle not found: ${candidates.join(', ')}`);
  }
  return bundle;
}

function readJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`invalid content JSON ${path}: ${(error as Error).message}`);
  }
}

function finiteNumber(value: unknown, name: string, fallback: number): number {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(number)) throw new Error(`invalid content: ${name} is not a number`);
  return number;
}

function validateMap(raw: Record<string, unknown>, path: string): WebMap {
  if (!Array.isArray(raw.rows) || raw.rows.length === 0) {
    throw new Error(`invalid content: ${path} has no rows`);
  }
  const rows = raw.rows.map((row) => String(row));
  if (rows.some((row) => row.length !== rows[0].length)) {
    throw new Error(`invalid content: ${path} has ragged rows`);
  }
  const tileset = raw.tileset as Record<string, unknown> | undefined;
  if (!tileset || typeof tileset.floor !== 'string' || typeof tileset.wall !== 'string') {
    throw new Error(`invalid content: ${path} has no tileset colors`);
  }
  return {
    rows,
    tile_size: finiteNumber(raw.tile_size, `${path}.tile_size`, 32),
    tileset: { floor: tileset.floor, wall: tileset.wall },
  };
}

export function readContent(contentDir: string, modulesDir: string): EmbeddedContent {
  const campaignPath = join(contentDir, 'levels/campaign.json');
  const campaign = readJson(campaignPath);
  if (!Array.isArray(campaign.levels) || campaign.levels.length === 0) {
    throw new Error(`invalid content: ${campaignPath} has no levels`);
  }
  const levels: WebLevel[] = [];
  for (const rawValue of campaign.levels) {
    if (typeof rawValue !== 'object' || rawValue === null) {
      throw new Error(`invalid content: ${campaignPath} contains a non-object level`);
    }
    const rawLevel = rawValue as Record<string, unknown>;
    const mapId = String(rawLevel.map ?? '');
    if (!/^[A-Za-z0-9_-]+$/.test(mapId)) {
      throw new Error(`invalid content: bad map id ${mapId}`);
    }
    const mapPath = join(contentDir, 'maps', `${mapId}.json`);
    const map = validateMap(readJson(mapPath), mapPath);
    const enemy = (rawLevel.enemy ?? {}) as Record<string, unknown>;
    levels.push({
      id: String(rawLevel.id ?? mapId),
      name: String(rawLevel.name ?? mapId),
      map,
      enemy: {
        kind: String(enemy.kind ?? 'slime'),
        max_hp: finiteNumber(enemy.max_hp, 'enemy.max_hp', 30),
        attack_damage: finiteNumber(enemy.attack_damage, 'enemy.attack_damage', 5),
        attack_range: finiteNumber(enemy.attack_range, 'enemy.attack_range', 40),
        attack_cooldown: finiteNumber(enemy.attack_cooldown, 'enemy.attack_cooldown', 1),
        speed: finiteNumber(enemy.speed, 'enemy.speed', 80),
        x: finiteNumber(enemy.x, 'enemy.x', 600),
        y: finiteNumber(enemy.y, 'enemy.y', 240),
        scale: finiteNumber(enemy.scale, 'enemy.scale', 1),
      },
    });
  }

  const quests: WebQuest[] = [];
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
        count: finiteNumber(objective.count, 'quest.count', 1),
      });
    }
  }

  const items: Record<string, string> = {};
  const itemDir = join(contentDir, 'items');
  if (existsSync(itemDir)) {
    for (const file of readdirSync(itemDir).filter((name) => name.endsWith('.json'))) {
      const item = readJson(join(itemDir, file));
      const itemId = String(item.id ?? file.replace(/\.json$/, ''));
      items[itemId] = String(item.name ?? itemId);
    }
  }

  const loot: Record<string, WebLootDrop[]> = {};
  const lootDir = join(contentDir, 'loot');
  if (existsSync(lootDir)) {
    for (const file of readdirSync(lootDir).filter((name) => name.endsWith('.json'))) {
      const table = readJson(join(lootDir, file));
      const tableId = String(table.id ?? file.replace(/\.json$/, ''));
      const drops = Array.isArray(table.drops) ? table.drops : [];
      loot[tableId] = drops.map((drop) => ({
        item_id: String((drop as Record<string, unknown>).item_id ?? ''),
        chance: finiteNumber((drop as Record<string, unknown>).chance, 'loot.chance', 0),
      }));
    }
  }
  for (const [tableId, drops] of Object.entries(loot)) {
    for (const drop of drops) {
      if (!items[drop.item_id]) {
        throw new Error(`invalid content: loot ${tableId} references unknown item ${drop.item_id}`);
      }
    }
  }

  const sprites: Record<string, string> = {};
  const assets: EmbeddedAsset[] = [];
  const spriteDir = join(contentDir, 'sprites');
  if (existsSync(spriteDir)) {
    const root = resolve(modulesDir) + sep;
    for (const file of readdirSync(spriteDir).filter((name) => name.endsWith('.json'))) {
      const sprite = readJson(join(spriteDir, file));
      const spriteId = String(sprite.id ?? file.replace(/\.json$/, ''));
      const texture = String(sprite.texture ?? '');
      const match = /^res:\/\/modules\/([A-Za-z0-9_.-]+)\/assets\/([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*)$/.exec(
        texture,
      );
      if (!match) continue;
      if (match[2].split('/').includes('..')) {
        throw new Error(`invalid content: unsafe sprite path ${texture}`);
      }
      const source = resolve(join(modulesDir, match[1], 'assets', match[2]));
      if (!source.startsWith(root)) {
        throw new Error(`invalid content: sprite path escapes modules: ${texture}`);
      }
      if (!existsSync(source)) {
        throw new Error(`sprite asset not found: ${source}`);
      }
      const target = `assets/${match[1]}/${match[2]}`;
      assets.push({ source, target });
      sprites[spriteId] = target;
    }
  }
  return { levels, quests, sprites, items, loot, assets };
}

export function embedContent(
  contentDir: string,
  modulesDir: string,
  outDir: string,
): Pick<WebGameConfig, 'levels' | 'quests' | 'sprites' | 'items' | 'loot'> {
  const embedded = readContent(contentDir, modulesDir);
  for (const asset of embedded.assets) {
    const target = join(outDir, asset.target);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(asset.source, target);
  }
  return {
    levels: embedded.levels,
    quests: embedded.quests,
    sprites: embedded.sprites,
    items: embedded.items,
    loot: embedded.loot,
  };
}

export function composeWebProject(options: ComposeWebOptions): ComposeWebResult {
  const templatesDir =
    options.templatesDir ?? join(process.cwd(), 'templates/web-m0');
  if (!existsSync(templatesDir)) {
    throw new Error(`web template directory not found: ${templatesDir}`);
  }
  const embedded = options.contentDir
    ? readContent(
        options.contentDir,
        options.modulesDir ?? join(process.cwd(), 'modules'),
      )
    : null;
  if (
    existsSync(options.outDir) &&
    readdirSync(options.outDir).length > 0 &&
    !options.force
  ) {
    throw new Error(`refusing to overwrite non-empty ${options.outDir}; pass --force`);
  }
  const existed = existsSync(options.outDir);
  mkdirSync(options.outDir, { recursive: true });
  try {
    cpSync(templatesDir, options.outDir, { recursive: true });
    const vendor = join(options.outDir, 'vendor/phaser.min.js');
    mkdirSync(dirname(vendor), { recursive: true });
    copyFileSync(phaserBundle(), vendor);
    const missing = WEB_PROJECT_FILES.filter(
      (file) => file !== 'game.json' && !existsSync(join(options.outDir, file)),
    );
    if (missing.length > 0) {
      throw new Error(`web template is incomplete: missing ${missing.join(', ')}`);
    }
    const config: WebGameConfig = {
      ...DEFAULT_CONFIG,
      ...options.config,
      ...(embedded
        ? {
            levels: embedded.levels,
            quests: embedded.quests,
            sprites: embedded.sprites,
            items: embedded.items,
            loot: embedded.loot,
          }
        : {}),
      name: options.name ?? options.config?.name ?? DEFAULT_CONFIG.name,
      arena: { ...DEFAULT_CONFIG.arena, ...options.config?.arena },
      player: { ...DEFAULT_CONFIG.player, ...options.config?.player },
      enemy: { ...DEFAULT_CONFIG.enemy, ...options.config?.enemy },
    };
    if (embedded) {
      for (const asset of embedded.assets) {
        const target = join(options.outDir, asset.target);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(asset.source, target);
      }
    }
    writeFileSync(
      join(options.outDir, 'game.json'),
      `${JSON.stringify(config, null, 2)}\n`,
      'utf8',
    );
    return {
      outDir: options.outDir,
      files: [...WEB_PROJECT_FILES],
      config,
    };
  } catch (error) {
    if (!existed) rmSync(options.outDir, { recursive: true, force: true });
    throw error;
  }
}
