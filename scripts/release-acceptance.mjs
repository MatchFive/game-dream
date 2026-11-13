import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd();
const cli = join(root, 'packages/cli/dist/index.js');
if (!existsSync(cli)) {
  console.error('build the CLI first: pnpm build');
  process.exit(2);
}

function take(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}
function flag(name) {
  return process.argv.includes(name);
}

const webDir = take('--web');
const godotDir = take('--godot');
const unityDir = take('--unity-dir');
const unityBin = take('--unity-bin', process.env.UNITY_BIN);
const godotBin = take('--godot-bin', process.env.GODOT_BIN);
const skipRuntime = flag('--skip-runtime');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outRoot = resolve(take('--out-dir', join(root, 'dist/release-acceptance', stamp)));
const manifestPath = resolve(take('--manifest', join(outRoot, 'acceptance.json')));
mkdirSync(outRoot, { recursive: true });

const engines = {};

function command(engine, label, args, env = {}) {
  const entry = engines[engine] ?? { status: 'pass', commands: [] };
  engines[engine] = entry;
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 600_000,
    env: { ...process.env, ...env },
  });
  const record = {
    label,
    command: `node packages/cli/dist/index.js ${args.join(' ')}`,
    exitCode: result.status ?? 1,
    stdout: (result.stdout ?? '').trim().slice(-4000),
    stderr: (result.stderr ?? '').trim().slice(-4000),
  };
  entry.commands.push(record);
  if (record.exitCode !== 0) entry.status = 'fail';
  console.log(`${engine}/${label}: ${record.exitCode === 0 ? 'pass' : 'fail'}`);
  if (record.exitCode !== 0 && record.stderr) console.error(record.stderr);
  return record.exitCode === 0;
}

if (webDir) {
  const web = resolve(webDir);
  command('web', 'verify', ['web', 'verify', '--path', web, '--frames', '1800']);
  const packageDir = join(outRoot, 'web');
  command('web', 'package', ['web', 'package', '--path', web, '--out', packageDir, '--force']);
  engines.web.artifact = packageDir;
}

if (godotDir) {
  const godot = resolve(godotDir);
  const packageDir = join(outRoot, 'godot');
  command('godot', 'package', ['godot', 'package', '--path', godot, '--out', packageDir, '--force']);
  engines.godot.artifact = packageDir;
  if (!skipRuntime && godotBin) {
    command('godot', 'runtime verify', ['verify', '--path', godot], { GODOT_BIN: godotBin });
  } else {
    engines.godot.commands.push({ label: 'runtime verify', status: 'skipped', reason: skipRuntime ? '--skip-runtime' : 'GODOT_BIN unavailable' });
  }
}

if (unityDir) {
  const unity = resolve(unityDir);
  command('unity', 'static verify', ['unity', 'verify', '--path', unity]);
  engines.unity.artifact = unity;
  if (!skipRuntime && unityBin) {
    command('unity', 'runtime verify', [
      'unity',
      'verify',
      '--path',
      unity,
      '--runtime',
      '--unity',
      unityBin,
    ]);
  } else {
    engines.unity.commands.push({ label: 'runtime verify', status: 'skipped', reason: skipRuntime ? '--skip-runtime' : 'UNITY_BIN unavailable' });
  }
}

if (Object.keys(engines).length === 0) {
  console.error('pass at least one of --web, --godot, --unity-dir');
  process.exit(2);
}

const failed = Object.values(engines).some((engine) => engine.status === 'fail');
const manifest = {
  generatedAt: new Date().toISOString(),
  status: failed ? 'fail' : 'pass',
  outDir: outRoot,
  engines,
};
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Manifest: ${manifestPath}`);
process.exit(failed ? 1 : 0);
