#!/usr/bin/env node
/**
 * 边界检查（见 docs/boundaries.md）。
 *
 * 它检查的是"产物位置是否合法 + 需求是否可追溯"，不是"谁写的"——
 * 进程无法自证身份， authorship 靠约定与 review，这一点在文档里写明了。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

/** 游戏实现与生成产物允许出现的根目录。 */
const ALLOWED_GAME_ROOTS = [
  'templates',
  'modules',
  'skills',
  'fixtures',
  'packages', // 适配器随包分发的运行时（如 packages/unity/assets/*.cs）
  'docs/evidence',
  'dist',
  '.gamedream',
  'game',
];

const GAME_ARTIFACT_EXT = ['.tscn', '.unity', '.tres', '.gd', '.cs', '.godot'];

const SKIP_DIRS = new Set(['node_modules', '.git', '.pnpm-store', 'coverage']);

function walk(dir, root, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, root, out);
    } else {
      out.push(relative(root, full).split(sep).join('/'));
    }
  }
  return out;
}

/** 需求校验：用 core 里同一份实现，避免仓库检查和 CLI 各自为政。 */
async function loadRequestParser(root) {
  const candidates = [
    join(root, 'packages/core/dist/request.js'),
    join(root, 'packages/core/dist/index.js'),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const mod = await import(`file://${file.replace(/\\/g, '/')}`);
    if (typeof mod.parseRequest === 'function') return mod.parseRequest;
  }
  throw new Error('cannot load parseRequest — run `pnpm build` first');
}

export async function checkBoundaries(root = process.cwd()) {
  const problems = [];
  const info = [];

  // 1. 契约必须存在，且互相指向（防止规则被静默删除）
  const agents = join(root, 'AGENTS.md');
  const boundaries = join(root, 'docs/boundaries.md');
  if (!existsSync(agents)) problems.push('AGENTS.md is missing — the contract must stay in the repo');
  if (!existsSync(boundaries)) problems.push('docs/boundaries.md is missing');
  if (existsSync(agents) && !readFileSync(agents, 'utf8').includes('docs/boundaries.md')) {
    problems.push('AGENTS.md no longer points at docs/boundaries.md');
  }

  // 2. 需求全部通过 schema
  const parseRequest = await loadRequestParser(root);
  const requestsDir = join(root, 'requests');
  const requests = [];
  if (existsSync(requestsDir)) {
    for (const name of readdirSync(requestsDir).filter((file) => file.endsWith('.json'))) {
      const file = join(requestsDir, name);
      try {
        const request = parseRequest(JSON.parse(readFileSync(file, 'utf8')));
        requests.push(request);
      } catch (error) {
        problems.push(`requests/${name}: ${error.message}`);
      }
    }
  } else {
    info.push('no requests/ directory yet (the channel is unused)');
  }

  // 3. 游戏产物只能落在允许的根目录
  const files = walk(root, root);
  const strays = files.filter((file) => {
    if (!GAME_ARTIFACT_EXT.some((ext) => file.endsWith(ext))) return false;
    return !ALLOWED_GAME_ROOTS.some((allowed) => file === allowed || file.startsWith(`${allowed}/`));
  });
  for (const file of strays) {
    problems.push(`game artifact outside allowed roots: ${file}`);
  }

  info.push(`game artifact files: ${files.filter((f) => GAME_ARTIFACT_EXT.some((e) => f.endsWith(e))).length}`);
  info.push(`requests: ${requests.length} (${requests.filter((r) => r.status === 'done').length} done)`);

  return { problems, info };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if (isMain || process.argv.includes('--run')) {
  const { problems, info } = await checkBoundaries();
  for (const line of info) console.log(`  ${line}`);
  if (problems.length > 0) {
    for (const line of problems) console.error(`BOUNDARY_VIOLATION: ${line}`);
    console.error(`\n${problems.length} problem(s). See docs/boundaries.md`);
    process.exit(1);
  }
  console.log('BOUNDARIES_OK=1');
}
