#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const cli = join(root, 'packages', 'cli', 'dist', 'index.js');
const studioServer = join(root, 'packages', 'studio', 'dist', 'server.js');
const buildStamp = join(root, 'packages', 'cli', 'dist', '.gamedream-build');
const installStamp = join(root, 'node_modules', '.gamedream-install');

function newestMtime(path) {
  let newest = 0;
  try {
    const stat = statSync(path);
    if (stat.isFile()) return stat.mtimeMs;
    if (!stat.isDirectory()) return 0;
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (['node_modules', 'dist', '.git'].includes(entry.name)) continue;
      newest = Math.max(newest, newestMtime(join(path, entry.name)));
    }
  } catch {
    return 0;
  }
  return newest;
}

function packageDirectories() {
  const packages = join(root, 'packages');
  try {
    const top = readdirSync(packages, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(packages, entry.name));
    // packages/studio/web 是嵌套 workspace（Vite 前端），也要纳入构建与安装判定
    const nested = join(packages, 'studio', 'web');
    return existsSync(join(nested, 'package.json')) ? [...top, nested] : top;
  } catch {
    return [];
  }
}

function installInputs() {
  return [
    join(root, 'package.json'),
    join(root, 'pnpm-lock.yaml'),
    join(root, 'pnpm-workspace.yaml'),
    ...packageDirectories().map((directory) => join(directory, 'package.json')),
  ];
}

function missingWorkspaceLinks() {
  for (const directory of packageDirectories()) {
    const manifestPath = join(directory, 'package.json');
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch {
      continue;
    }
    const dependencies = {
      ...(manifest.dependencies ?? {}),
      ...(manifest.devDependencies ?? {}),
    };
    for (const [name, version] of Object.entries(dependencies)) {
      if (!String(version).startsWith('workspace:')) continue;
      const link = join(directory, 'node_modules', ...name.split('/'));
      if (!existsSync(link)) return true;
    }
  }
  return false;
}

function needsInstall() {
  if (!existsSync(join(root, 'node_modules', '.pnpm')) || !existsSync(installStamp)) {
    return true;
  }
  const installedAt = statSync(installStamp).mtimeMs;
  return installInputs().some((input) => newestMtime(input) > installedAt)
    || missingWorkspaceLinks();
}

function buildInputs() {
  return [
    ...installInputs(),
    join(root, 'tsconfig.base.json'),
    ...packageDirectories().flatMap((directory) => [
      join(directory, 'src'),
      join(directory, 'tsconfig.json'),
    ]),
  ];
}

function needsBuild() {
  if (!existsSync(cli) || !existsSync(studioServer) || !existsSync(buildStamp)) return true;
  const builtAt = statSync(buildStamp).mtimeMs;
  return buildInputs().some((input) => newestMtime(input) > builtAt);
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (!Number.isInteger(nodeMajor) || nodeMajor < 22) {
  console.error(`GameDream requires Node.js 22+; found ${process.versions.node}.`);
  console.error('Install Node.js 22 or newer and run the launcher again.');
  process.exit(3);
}

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}
function flag(name) {
  return process.argv.includes(`--${name}`);
}
function help() {
  console.log(`GameDream Studio launcher

Usage:
  node scripts/start.mjs [options]

Options:
  --path <dir>        project root (default: current directory)
  --workspace <dir>   workspace for settings and managed projects
  --host <host>       HTTP bind host (default: 127.0.0.1)
  --port <port>       HTTP port (default: 4173)
  --build             force a workspace build before starting
  --skip-install      do not run pnpm install when dependencies are missing or stale
  --no-open           do not open the browser
  -h, --help          show this help
`);
}

if (flag('help') || process.argv.includes('-h')) {
  help();
  process.exit(0);
}

const projectPath = resolve(arg('path', process.cwd()));
if (!existsSync(projectPath) || !statSync(projectPath).isDirectory()) {
  console.error(`Project directory not found: ${projectPath}`);
  process.exit(2);
}
const workspace = arg('workspace');
const host = arg('host', '127.0.0.1');
const port = arg('port', '4173');
const shouldOpen = !flag('no-open');
const packageCommand = process.platform === 'win32' ? 'corepack' : 'corepack';
const pnpm = (args) => {
  const isWindows = process.platform === 'win32';
  const command = isWindows ? process.env.ComSpec ?? 'cmd.exe' : packageCommand;
  const commandArgs = isWindows
    ? ['/d', '/s', '/c', `corepack pnpm ${args.join(' ')}`]
    : ['pnpm', ...args];
  let result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    windowsHide: true,
  });
  if (isWindows && (result.error || result.status !== 0)) {
    const fallback = spawnSync('pnpm', args, {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
      shell: true,
      windowsHide: true,
    });
    if (!fallback.error) result = fallback;
  }
  if (result.error) {
    console.error(`[GameDream] Could not run pnpm: ${result.error.message}`);
    console.error('Install Node.js 22+ with Corepack, or install pnpm 9, then retry.');
    return { status: 1 };
  }
  return result;
};

if (needsInstall()) {
  if (flag('skip-install')) {
    if (!existsSync(join(root, 'node_modules', '.pnpm'))) {
      console.error('Dependencies are missing and --skip-install was set.');
      process.exit(3);
    }
    console.warn('Workspace dependencies look stale; continuing because --skip-install was set.');
  } else {
    console.log('Installing or refreshing workspace dependencies...');
    const install = pnpm(['install']);
    if (install.status !== 0) process.exit(install.status ?? 1);
    if (missingWorkspaceLinks()) {
      console.error('Workspace dependency links are still missing after pnpm install.');
      console.error('Run `pnpm install` manually and check the workspace dependency names.');
      process.exit(3);
    }
    writeFileSync(installStamp, new Date().toISOString(), 'utf8');
  }
}

const staleBuild = needsBuild();
if (staleBuild || flag('build')) {
  console.log(staleBuild
    ? 'Source is newer than the build; rebuilding GameDream workspace...'
    : 'Building GameDream workspace...');
  const build = pnpm(['build']);
  if (build.status !== 0) process.exit(build.status ?? 1);
  writeFileSync(buildStamp, new Date().toISOString(), 'utf8');
}

const args = [cli, 'studio', '--path', projectPath, '--host', host, '--port', port];
if (workspace) args.push('--workspace', resolve(workspace));
if (shouldOpen) args.push('--open');

console.log(`Starting GameDream Studio for ${projectPath}`);
const child = spawn(process.execPath, args, {
  cwd: projectPath,
  stdio: 'inherit',
  env: process.env,
});
child.once('error', (error) => {
  console.error(`Failed to start Studio: ${error.message}`);
  process.exit(1);
});
child.once('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => child.kill(signal));
}
