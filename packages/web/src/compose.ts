import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';

export const WEB_PROJECT_FILES = [
  'index.html',
  'style.css',
  'sim.mjs',
  'sim-run.mjs',
  'game.js',
  'game.json',
  'README.md',
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
    speed: number;
    x: number;
    y: number;
    scale: number;
  };
}

export interface WebQuest {
  id: string;
  title: string;
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

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

export function embedContent(
  contentDir: string,
  modulesDir: string,
  outDir: string,
): Pick<WebGameConfig, 'levels' | 'quests' | 'sprites'> {
  const campaign = readJson(join(contentDir, 'levels/campaign.json'));
  const levels: WebLevel[] = [];
  for (const rawLevel of campaign.levels as Array<Record<string, unknown>>) {
    const mapId = String(rawLevel.map ?? '');
    const map = readJson(join(contentDir, 'maps', `${mapId}.json`));
    const enemy = (rawLevel.enemy ?? {}) as Record<string, unknown>;
    levels.push({
      id: String(rawLevel.id ?? mapId),
      name: String(rawLevel.name ?? mapId),
      map: {
        rows: map.rows as string[],
        tile_size: Number(map.tile_size ?? 32),
        tileset: map.tileset as WebMap['tileset'],
      },
      enemy: {
        kind: String(enemy.kind ?? 'slime'),
        max_hp: Number(enemy.max_hp ?? 30),
        attack_damage: Number(enemy.attack_damage ?? 5),
        speed: Number(enemy.speed ?? 80),
        x: Number(enemy.x ?? 600),
        y: Number(enemy.y ?? 240),
        scale: Number(enemy.scale ?? 1),
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
        target: String(objective.target ?? ''),
        count: Number(objective.count ?? 1),
      });
    }
  }

  const sprites: Record<string, string> = {};
  const spriteDir = join(contentDir, 'sprites');
  if (existsSync(spriteDir)) {
    mkdirSync(join(outDir, 'assets'), { recursive: true });
    for (const file of readdirSync(spriteDir).filter((name) => name.endsWith('.json'))) {
      const sprite = readJson(join(spriteDir, file));
      const spriteId = String(sprite.id ?? file.replace(/\.json$/, ''));
      const texture = String(sprite.texture ?? '');
      const match = /^res:\/\/modules\/([^/]+)\/assets\/(.+)$/.exec(texture);
      if (!match) continue;
      const source = join(modulesDir, match[1], 'assets', match[2]);
      if (!existsSync(source)) {
        throw new Error(`sprite asset not found: ${source}`);
      }
      const target = `assets/${basename(match[2])}`;
      copyFileSync(source, join(outDir, target));
      sprites[spriteId] = target;
    }
  }
  return { levels, quests, sprites };
}

export function composeWebProject(options: ComposeWebOptions): ComposeWebResult {
  const templatesDir =
    options.templatesDir ?? join(process.cwd(), 'templates/web-m0');
  if (!existsSync(templatesDir)) {
    throw new Error(`web template directory not found: ${templatesDir}`);
  }
  if (
    existsSync(options.outDir) &&
    readdirSync(options.outDir).length > 0 &&
    !options.force
  ) {
    throw new Error(`refusing to overwrite non-empty ${options.outDir}; pass --force`);
  }
  mkdirSync(options.outDir, { recursive: true });
  cpSync(templatesDir, options.outDir, { recursive: true });
  const missing = WEB_PROJECT_FILES.filter(
    (file) => file !== 'game.json' && !existsSync(join(options.outDir, file)),
  );
  if (missing.length > 0) {
    throw new Error(`web template is incomplete: missing ${missing.join(', ')}`);
  }

  const embedded = options.contentDir
    ? embedContent(
        options.contentDir,
        options.modulesDir ?? join(process.cwd(), 'modules'),
        options.outDir,
      )
    : {};
  const config: WebGameConfig = {
    ...DEFAULT_CONFIG,
    ...options.config,
    ...embedded,
    name: options.name ?? options.config?.name ?? DEFAULT_CONFIG.name,
    arena: { ...DEFAULT_CONFIG.arena, ...options.config?.arena },
    player: { ...DEFAULT_CONFIG.player, ...options.config?.player },
    enemy: { ...DEFAULT_CONFIG.enemy, ...options.config?.enemy },
  };
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
}
