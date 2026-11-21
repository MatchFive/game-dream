import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import type {
  CanvasNode,
  CanvasState,
  StudioAsset,
  StudioAssetKind,
  StudioAssetSource,
  StudioProject,
} from './types.js';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a']);
const SKIP_DIRECTORIES = new Set([
  '.git',
  '.gamedream',
  'node_modules',
  'dist',
  'build',
  '.tools',
  'Library',
  'Temp',
  'obj',
]);

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
};

export function assetIdFor(file: string): string {
  return createHash('sha1').update(file.split('\\').join('/')).digest('hex').slice(0, 12);
}

function prettyName(file: string): string {
  const raw = basename(file, extname(file));
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(raw)) return 'Generated asset';
  const cleaned = raw.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^bgm$/i.test(cleaned)) return 'BGM loop';
  if (/^enemy crawler$/i.test(cleaned)) return 'Crawler';
  if (/^enemy brute$/i.test(cleaned)) return 'Brute';
  return cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function classifyAsset(file: string, source: StudioAssetSource): StudioAssetKind {
  const extension = extname(file).toLowerCase();
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  const normalized = file.split('\\').join('/').toLowerCase();
  if (normalized.includes('concept') || normalized.includes('comfy-sprite')) return 'concept';
  if (
    source === 'evidence' ||
    normalized.includes('screenshot') ||
    normalized.includes('/screenshots/')
  ) {
    return 'screenshot';
  }
  if (
    extension === '.svg' ||
    /(?:^|[/_-])(player|enemy|boss|crawler|brute|gem|sprite)(?:[/_.-]|$)/i.test(normalized)
  ) {
    return 'sprite';
  }
  return 'concept';
}

function walk(directory: string, visit: (file: string) => void, root: string): void {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      walk(join(directory, entry.name), visit, root);
      continue;
    }
    if (!entry.isFile()) continue;
    const extension = extname(entry.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension) && !AUDIO_EXTENSIONS.has(extension)) continue;
    const file = join(directory, entry.name);
    if (resolve(file).startsWith(resolve(root))) visit(file);
  }
}

function readGeneratedMetadata(directory: string): Map<string, { prompt?: string; seed?: string; name?: string }> {
  const metadata = new Map<string, { prompt?: string; seed?: string; name?: string }>();
  if (!existsSync(directory)) return metadata;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || extname(entry.name) !== '.json') continue;
    try {
      const parsed = JSON.parse(readFileSync(join(directory, entry.name), 'utf8')) as {
        name?: string;
        prompt?: string;
        seed?: number | string;
        file?: string;
      };
      const file = parsed.file ?? entry.name.replace(/\.json$/, '.png');
      metadata.set(file, {
        name: typeof parsed.name === 'string' ? parsed.name : undefined,
        prompt: typeof parsed.prompt === 'string' ? parsed.prompt : undefined,
        seed: parsed.seed === undefined ? undefined : String(parsed.seed),
      });
    } catch {
      // Ignore malformed sidecars; the asset can still be listed.
    }
  }
  return metadata;
}

function loadCanvasFile(root: string): CanvasState {
  const file = join(root, '.gamedream', 'studio', 'canvas.json');
  if (!existsSync(file)) return { nodes: [], inBuild: [] };
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<CanvasState>;
    return {
      nodes: Array.isArray(parsed.nodes) ? parsed.nodes.filter(isCanvasNode) : [],
      inBuild: Array.isArray(parsed.inBuild)
        ? parsed.inBuild.filter((value): value is string => typeof value === 'string').slice(0, 500)
        : [],
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
    };
  } catch {
    return { nodes: [], inBuild: [] };
  }
}

function isCanvasNode(value: unknown): value is CanvasNode {
  if (!value || typeof value !== 'object') return false;
  const node = value as Partial<CanvasNode>;
  return (
    typeof node.id === 'string' &&
    ['brief', 'asset', 'group', 'build'].includes(String(node.kind)) &&
    Number.isFinite(node.x) &&
    Number.isFinite(node.y) &&
    Number.isFinite(node.width) &&
    (node.assetId === undefined || typeof node.assetId === 'string') &&
    (node.assetIds === undefined ||
      (Array.isArray(node.assetIds) && node.assetIds.every((id) => typeof id === 'string')))
  );
}

export function loadCanvas(root: string): CanvasState {
  return loadCanvasFile(root);
}

export function saveCanvas(root: string, canvas: Partial<CanvasState>): CanvasState {
  const nodes = Array.isArray(canvas.nodes)
    ? canvas.nodes.filter(isCanvasNode).slice(0, 300).map((node) => ({
        ...node,
        x: Math.round(node.x),
        y: Math.round(node.y),
        width: Math.min(720, Math.max(140, Math.round(node.width))),
      }))
    : [];
  const inBuild = Array.isArray(canvas.inBuild)
    ? canvas.inBuild.filter((value): value is string => typeof value === 'string').slice(0, 500)
    : [];
  const next: CanvasState = { nodes, inBuild, updatedAt: new Date().toISOString() };
  const file = join(root, '.gamedream', 'studio', 'canvas.json');
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  renameSync(temporary, file);
  return next;
}

export function toggleInBuild(root: string, assetId: string): CanvasState {
  const canvas = loadCanvas(root);
  const selected = new Set(canvas.inBuild);
  if (selected.has(assetId)) selected.delete(assetId);
  else selected.add(assetId);
  return saveCanvas(root, { ...canvas, inBuild: [...selected] });
}

export function setInBuild(root: string, assetId: string, value: boolean): CanvasState {
  const canvas = loadCanvas(root);
  const selected = new Set(canvas.inBuild);
  if (value) selected.add(assetId);
  else selected.delete(assetId);
  return saveCanvas(root, { ...canvas, inBuild: [...selected] });
}

export function projectName(root: string): string {
  const config = join(root, 'gamedream.yaml');
  if (existsSync(config)) {
    try {
      const match = readFileSync(config, 'utf8').match(/^name:\s*["']?([^"'\r\n]+)["']?/m);
      if (match?.[1]?.trim()) return match[1].trim();
    } catch {
      // Fall back to package metadata or the directory name.
    }
  }
  const packageFile = join(root, 'package.json');
  if (existsSync(packageFile)) {
    try {
      const pkg = JSON.parse(readFileSync(packageFile, 'utf8')) as { name?: string };
      if (pkg.name) return pkg.name;
    } catch {
      // Ignore malformed package metadata.
    }
  }
  return basename(root);
}

export function loadProject(root: string): StudioProject {
  return { name: projectName(root), root };
}

export function scanAssets(root: string, inBuild: string[] = []): StudioAsset[] {
  const assets = new Map<string, StudioAsset>();
  const selected = new Set(inBuild);
  const add = (file: string, source: StudioAssetSource, prompt?: string, seed?: string, name?: string): void => {
    const relativePath = relative(root, file).split('\\').join('/');
    if (relativePath.startsWith('..')) return;
    const id = assetIdFor(relativePath);
    if (assets.has(id)) return;
    const extension = extname(file).toLowerCase();
    const bytes = (() => {
      try {
        return statSync(file).size;
      } catch {
        return 0;
      }
    })();
    const kind = classifyAsset(file, source);
    assets.set(id, {
      id,
      name: name || prettyName(file),
      file: relativePath,
      url: `/api/assets/${id}/raw`,
      kind,
      mime: MIME_TYPES[extension] ?? 'application/octet-stream',
      bytes,
      source,
      prompt,
      seed,
      inBuild: selected.has(id),
    });
  };

  for (const entry of [
    [join(root, 'assets'), 'project'],
    [join(root, 'game', 'assets'), 'project'],
    [join(root, 'screenshots'), 'project'],
    [join(root, 'docs', 'evidence'), 'evidence'],
  ] as const) {
    walk(entry[0], (file) => add(file, entry[1]), root);
  }

  const generatedDirectory = join(root, '.gamedream', 'studio', 'generated');
  const generatedMetadata = readGeneratedMetadata(generatedDirectory);
  walk(
    generatedDirectory,
    (file) => {
      const metadata = generatedMetadata.get(basename(file));
      add(file, 'generated', metadata?.prompt, metadata?.seed, metadata?.name);
    },
    root,
  );

  const modules = join(root, 'modules');
  if (existsSync(modules)) {
    for (const moduleEntry of readdirSync(modules, { withFileTypes: true })) {
      if (!moduleEntry.isDirectory()) continue;
      const assetsDirectory = join(modules, moduleEntry.name, 'assets');
      walk(assetsDirectory, (file) => add(file, 'module'), root);
    }
  }

  return [...assets.values()].sort((a, b) => {
    const sourceOrder: Record<StudioAssetSource, number> = {
      generated: 0,
      project: 1,
      module: 2,
      evidence: 3,
    };
    return (
      sourceOrder[a.source] - sourceOrder[b.source] ||
      a.kind.localeCompare(b.kind) ||
      a.name.localeCompare(b.name)
    );
  });
}

export function findAsset(root: string, assetId: string): StudioAsset | undefined {
  const canvas = loadCanvas(root);
  return scanAssets(root, canvas.inBuild).find((asset) => asset.id === assetId);
}

export function mimeForFile(file: string): string {
  return MIME_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}
