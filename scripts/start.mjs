#!/usr/bin/env node
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const cli = join(root, 'packages', 'cli', 'dist', 'index.js');

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
  --skip-install      do not run pnpm install when node_modules is missing
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
const packageCommand = process.platform === 'win32' ? 'corepack.cmd' : 'corepack';
const pnpm = (args) =>
  spawnSync(packageCommand, ['pnpm', ...args], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });

if (!existsSync(join(root, 'node_modules', '.pnpm'))) {
  if (flag('skip-install')) {
    console.error('Dependencies are missing and --skip-install was set.');
    process.exit(3);
  }
  console.log('Installing workspace dependencies...');
  const install = pnpm(['install']);
  if (install.status !== 0) process.exit(install.status ?? 1);
}

if (!existsSync(cli) || flag('build')) {
  console.log('Building GameDream workspace...');
  const build = pnpm(['build']);
  if (build.status !== 0) process.exit(build.status ?? 1);
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
