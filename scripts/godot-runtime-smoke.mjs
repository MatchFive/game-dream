#!/usr/bin/env node
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve('.');

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const outDir = resolve(arg('out', 'dist/godot-runtime-smoke'));
const spec = resolve(arg('spec', 'fixtures/specs/m1.yaml'));
const godot = process.env.GODOT_BIN;
if (!godot) {
  console.error('GODOT_BIN is required for the real Godot runtime smoke');
  process.exit(3);
}
if (!existsSync(godot)) {
  console.error(`GODOT_BIN does not exist: ${godot}`);
  process.exit(3);
}

rmSync(outDir, { recursive: true, force: true });
const cli = resolve('packages/cli/dist/index.js');
const env = { ...process.env, GODOT_BIN: godot };

function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}

console.log(`GODOT_RUNTIME_BIN=${godot}`);
const compose = run([
  'compose',
  '--spec',
  spec,
  '--out',
  outDir,
  '--modules',
  resolve('modules'),
  '--templates',
  resolve('templates'),
]);
if (compose.status !== 0) {
  console.error(`GODOT_RUNTIME_COMPOSE_EXIT=${compose.status ?? 'unknown'}`);
  process.exit(1);
}

const verify = run(['verify', '--path', outDir, '--json']);
if (verify.status !== 0) {
  console.error(`GODOT_RUNTIME_VERIFY_EXIT=${verify.status ?? 'unknown'}`);
  process.exit(1);
}

let report;
try {
  report = JSON.parse(verify.stdout.trim());
} catch (error) {
  console.error(`GODOT_RUNTIME_JSON_ERROR=${error.message}`);
  process.exit(1);
}
const gates = report.gates ?? {};
for (const gate of ['G1', 'G2', 'G3']) {
  console.log(`GODOT_RUNTIME_${gate}=${gates[gate]?.status ?? 'missing'}`);
  if (gates[gate]?.status !== 'pass') {
    console.error(`GODOT_RUNTIME_${gate}_FAILED`);
    process.exit(1);
  }
}
console.log(`GODOT_RUNTIME_ENGINE=${report.engine}`);
console.log('GODOT_RUNTIME_OK=1');
console.log('GODOT_RUNTIME_EXIT=0');
