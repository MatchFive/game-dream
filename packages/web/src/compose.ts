import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const WEB_PROJECT_FILES = [
  'index.html',
  'style.css',
  'sim.mjs',
  'sim-run.mjs',
  'game.js',
  'game.json',
  'README.md',
] as const;

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
}

export interface ComposeWebOptions {
  outDir: string;
  templatesDir?: string;
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
  const config: WebGameConfig = {
    ...DEFAULT_CONFIG,
    ...options.config,
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
