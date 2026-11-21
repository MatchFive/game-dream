#!/usr/bin/env node
import { existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectGodot,
  findExportTemplates,
  hostTemplatePlatform,
  templateVersion,
} from '../packages/godot/dist/index.js';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = resolve(arg('out', resolve(root, 'dist/godot-export')));
const requireTemplates = process.argv.includes('--require');
const godot = await detectGodot({ env: process.env });
if (!godot) {
  console.log('GODOT_EXPORT_SKIP=1');
  console.log('reason=Godot not found; set GODOT_BIN');
  process.exit(requireTemplates ? 3 : 0);
}
const platform = hostTemplatePlatform();
const templates = findExportTemplates(godot.version, process.env, process.platform, platform);
if (!templates.installed) {
  console.log('GODOT_EXPORT_SKIP=1');
  console.log(`reason=export templates missing for ${templateVersion(godot.version)} (${platform})`);
  console.log(`expected=${templates.dir}`);
  process.exit(requireTemplates ? 3 : 0);
}
const preset = platform === 'windows' ? 'Windows Desktop' : 'Linux';
const output = platform === 'windows'
  ? resolve(outDir, 'build/game.exe')
  : resolve(outDir, 'build/game.x86_64');
const cli = resolve(root, 'packages/cli/dist/index.js');
const compose = spawnSync(process.execPath, [
  cli,
  'compose',
  '--spec', resolve(root, 'fixtures/specs/m1.yaml'),
  '--out', outDir,
  '--modules', resolve(root, 'modules'),
  '--templates', resolve(root, 'templates'),
], { cwd: root, stdio: 'inherit', env: process.env });
if (compose.status !== 0) {
  console.log(`GODOT_EXPORT_FAILED=1`);
  console.log(`compose exit ${compose.status}`);
  process.exit(1);
}
const exported = spawnSync(process.execPath, [
  cli,
  'godot',
  'export',
  '--path', outDir,
  '--preset', preset,
  '--out', output,
], { cwd: root, stdio: 'inherit', env: process.env });
if (exported.status !== 0 || !existsSync(output) || statSync(output).size === 0) {
  console.log(`GODOT_EXPORT_FAILED=1`);
  console.log(`export exit ${exported.status}; output=${output}`);
  process.exit(1);
}
console.log(`GODOT_EXPORT_OK=1`);
console.log(`platform=${platform}`);
console.log(`output=${output}`);
console.log(`bytes=${statSync(output).size}`);
