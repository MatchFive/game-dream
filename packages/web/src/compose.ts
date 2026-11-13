import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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
  const gamePath = join(options.outDir, 'game.json');
  if (existsSync(gamePath) && !options.force) {
    throw new Error(`refusing to overwrite ${gamePath}; pass --force`);
  }
  mkdirSync(options.outDir, { recursive: true });
  cpSync(templatesDir, options.outDir, { recursive: true });
  const config: WebGameConfig = {
    ...DEFAULT_CONFIG,
    ...options.config,
    name: options.name ?? options.config?.name ?? DEFAULT_CONFIG.name,
  };
  writeFileSync(gamePath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return {
    outDir: options.outDir,
    files: ['index.html', 'style.css', 'sim.mjs', 'sim-run.mjs', 'game.js', 'game.json'],
    config,
  };
}
