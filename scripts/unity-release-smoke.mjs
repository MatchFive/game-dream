#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  composeUnityProject,
  detectUnity,
  runUnityBuild,
  runUnityScreenshot,
  runUnitySmoke,
} from '../packages/unity/dist/index.js';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = resolve(arg('out', resolve(root, 'dist/unity-release')));
const requireUnity = process.argv.includes('--require');
const unity = await detectUnity({ env: process.env });
if (!unity) {
  console.log('UNITY_RELEASE_SKIP=1');
  console.log('reason=Unity not found; set UNITY_BIN');
  process.exit(requireUnity ? 3 : 0);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(dirname(outDir), { recursive: true });
composeUnityProject({
  outDir,
  templatesDir: resolve(root, 'templates/unity-survivor'),
  name: 'unity-release',
});

const exePath = resolve(outDir, 'Builds/Windows/GameDream.exe');
const build = runUnityBuild({
  projectDir: outDir,
  unityBin: unity.bin,
  outPath: exePath,
  timeoutMs: 300_000,
});
if (!build.passed || !existsSync(exePath)) {
  console.log('UNITY_RELEASE_FAILED=1');
  console.log(build.message ?? 'build failed');
  if (build.stdout) console.log(build.stdout.slice(-4000));
  if (build.stderr) console.log(build.stderr.slice(-4000));
  process.exit(1);
}

const smoke = runUnitySmoke({
  projectDir: outDir,
  exePath,
  timeoutMs: 60_000,
});
if (!smoke.passed) {
  console.log('UNITY_RELEASE_FAILED=1');
  console.log(smoke.message ?? 'smoke failed');
  process.exit(1);
}
if (existsSync(smoke.logPath)) {
  cpSync(smoke.logPath, resolve(outDir, 'smoke.log'));
}

const screenshot = runUnityScreenshot({
  projectDir: outDir,
  unityBin: unity.bin,
  outPath: resolve(outDir, 'Screenshots/unity.png'),
  timeoutMs: 180_000,
});
if (!screenshot.passed || !existsSync(screenshot.imagePath)) {
  console.log('UNITY_RELEASE_FAILED=1');
  console.log(screenshot.message ?? 'screenshot failed');
  process.exit(1);
}

console.log('UNITY_RELEASE_OK=1');
console.log(`unity=${unity.version}`);
console.log(`exe=${exePath}`);
console.log(`exe_bytes=${statSync(exePath).size}`);
console.log(`smoke=${smoke.logPath}`);
console.log(`screenshot=${screenshot.imagePath}`);
