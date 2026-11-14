import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import {
  FakeProvider,
  createProvider,
  extractJson,
  type ModelProvider,
  type ProviderKind,
} from '@gamedream/agent';
import { composeProject } from '@gamedream/core';
import { detectGodot, runCommand, type CommandRunner } from '@gamedream/godot';
import { verifyCommand, type VerifyReport } from './verify.js';

export interface DevelopmentCase {
  id: string;
  prompt: string;
  skill: string;
  expected_markers?: string[];
  expected_playable?: boolean;
}

export interface DevelopOptions {
  prompt: string;
  outDir: string;
  skillsDir: string;
  skill: string;
  providerKind: ProviderKind;
  provider?: ModelProvider;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  runner?: CommandRunner;
  maxSteps?: number;
  visual?: boolean;
  expectedMarkers?: string[];
}

export interface DevelopAction {
  tool: string;
  args?: Record<string, unknown>;
}

export interface DevelopToolResult {
  ok: boolean;
  output: string;
  data?: unknown;
}

export interface DevelopReport {
  provider: string;
  skill: string;
  outDir: string;
  steps: number;
  actions: string[];
  finished: boolean;
  missingMarkers: string[];
  verify: VerifyReport;
}

interface DevelopContext extends DevelopOptions {
  projectDir: string;
}

interface Tool {
  name: string;
  description: string;
  run(args: Record<string, unknown>, context: DevelopContext): Promise<DevelopToolResult>;
}

const SCRIPTED_ACTIONS = [
  JSON.stringify({ tool: 'scaffold', args: {} }),
  JSON.stringify({ tool: 'verify', args: {} }),
  JSON.stringify({ tool: 'finish', args: { summary: 'demo generated and verified' } }),
];

export function loadDevelopmentCase(path: string): DevelopmentCase {
  const data = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (typeof data !== 'object' || data === null) throw new Error('invalid development case');
  const entry = data as Record<string, unknown>;
  const id = String(entry.id ?? '');
  const prompt = String(entry.prompt ?? '');
  const skill = String(entry.skill ?? '');
  if (!id || !prompt || !skill) throw new Error('development case requires id, prompt, and skill');
  return {
    id,
    prompt,
    skill,
    expected_markers: Array.isArray(entry.expected_markers)
      ? entry.expected_markers.map(String)
      : undefined,
    expected_playable: typeof entry.expected_playable === 'boolean' ? entry.expected_playable : true,
  };
}

function inside(root: string, relative: string): string {
  const target = resolve(root, relative);
  const normalizedRoot = resolve(root) + sep;
  if (target !== resolve(root) && !target.startsWith(normalizedRoot)) {
    throw new Error(`path escapes project: ${relative}`);
  }
  return target;
}

function missingExpectedMarkers(projectDir: string, expected: string[] | undefined): string[] {
  if (!expected || expected.length === 0) return [];
  try {
    const manifest = JSON.parse(
      readFileSync(join(projectDir, 'game/game.manifest.json'), 'utf8'),
    ) as { acceptance?: { markers?: unknown } };
    const markers = Array.isArray(manifest.acceptance?.markers)
      ? manifest.acceptance.markers.map(String)
      : [];
    return expected.filter((marker) => !markers.includes(marker));
  } catch {
    return [...expected];
  }
}

function slug(input: string): string {
  const value = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return value || 'gamedream-demo';
}

function listFiles(root: string, prefix = ''): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listFiles(join(root, entry.name), relative));
    else files.push(relative);
  }
  return files.sort();
}

const TOOLS: Tool[] = [
  {
    name: 'scaffold',
    description:
      'Create the initial Godot project from the selected development skill kit. Use this before verify.',
    async run(args, context) {
      if (
        existsSync(join(context.outDir, 'gamedream.yaml')) &&
        existsSync(join(context.outDir, '.gamedream')) &&
        args.force !== true
      ) {
        return {
          ok: false,
          output:
            'Project is already scaffolded. Edit .gamedream modules/templates and call compose; pass force:true only to reset the project.',
        };
      }
      const skillName = String(args.skill ?? context.skill);
      const skillDir = join(context.skillsDir, skillName);
      const kitDir = join(skillDir, 'kit');
      if (!existsSync(kitDir)) {
        return { ok: false, output: `skill kit not found: ${kitDir}` };
      }
      const kitModules = join(kitDir, 'modules');
      const kitTemplates = join(kitDir, 'templates');
      const kitSpec = join(kitDir, 'spec.yaml');
      if (!existsSync(kitModules) || !existsSync(kitTemplates) || !existsSync(kitSpec)) {
        return { ok: false, output: `skill kit is incomplete: ${kitDir}` };
      }
      const modulesDir = join(context.outDir, '.gamedream', 'modules');
      const templatesDir = join(context.outDir, '.gamedream', 'templates');
      rmSync(modulesDir, { recursive: true, force: true });
      rmSync(templatesDir, { recursive: true, force: true });
      mkdirSync(modulesDir, { recursive: true });
      mkdirSync(templatesDir, { recursive: true });
      cpSync(kitModules, modulesDir, { recursive: true });
      cpSync(kitTemplates, templatesDir, { recursive: true });

      const templateIds = readdirSync(templatesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
      if (templateIds.length !== 1) {
        return { ok: false, output: 'skill kit must contain exactly one template' };
      }
      const specText = readFileSync(kitSpec, 'utf8')
        .replace(/^  name: .*$/m, `  name: ${slug(basename(context.outDir))}`)
        .replace(/^  template: .*$/m, `  template: ${templateIds[0]}`);
      const specPath = join(context.outDir, 'gamedream.yaml');
      writeFileSync(specPath, specText, 'utf8');
      const composed = await composeProject({
        specPath,
        outDir: context.outDir,
        modulesDir,
        templatesDir,
      });
      return {
        ok: true,
        output: `Scaffolded ${templateIds[0]} with ${composed.order.length} modules into ${context.outDir}`,
        data: { template: templateIds[0], modules: composed.order, files: composed.files },
      };
    },
  },
  {
    name: 'compose',
    description:
      'Regenerate composer output from gamedream.yaml and the skill kit under .gamedream/modules and .gamedream/templates. Use after editing kit source.',
    async run(_args, context) {
      const specPath = join(context.outDir, 'gamedream.yaml');
      const modulesDir = join(context.outDir, '.gamedream', 'modules');
      const templatesDir = join(context.outDir, '.gamedream', 'templates');
      if (!existsSync(specPath)) {
        return { ok: false, output: 'gamedream.yaml not found; run scaffold first' };
      }
      try {
        const composed = await composeProject({
          specPath,
          outDir: context.outDir,
          modulesDir,
          templatesDir,
        });
        return {
          ok: true,
          output: `Composed ${composed.order.length} modules and regenerated project files`,
          data: { modules: composed.order, files: composed.files },
        };
      } catch (error) {
        return { ok: false, output: (error as Error).message };
      }
    },
  },
  {
    name: 'read_file',
    description: 'Read a UTF-8 file relative to the generated project.',
    async run(args, context) {
      try {
        const path = inside(context.outDir, String(args.path ?? ''));
        if (!existsSync(path) || statSync(path).isDirectory()) {
          return { ok: false, output: `not a file: ${args.path}` };
        }
        return { ok: true, output: readFileSync(path, 'utf8').slice(0, 120_000) };
      } catch (error) {
        return { ok: false, output: (error as Error).message };
      }
    },
  },
  {
    name: 'write_file',
    description:
      'Write a UTF-8 file relative to the generated project. Use this to patch generated gameplay code or content.',
    async run(args, context) {
      try {
        const path = inside(context.outDir, String(args.path ?? ''));
        const content = String(args.content ?? '');
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content, 'utf8');
        return { ok: true, output: `Wrote ${content.length} bytes to ${args.path}` };
      } catch (error) {
        return { ok: false, output: (error as Error).message };
      }
    },
  },
  {
    name: 'list_files',
    description: 'List generated project files, optionally under a relative path.',
    async run(args, context) {
      try {
        const root = inside(context.outDir, String(args.path ?? '.'));
        const prefix = String(args.path ?? '.') === '.' ? '' : String(args.path);
        return { ok: true, output: listFiles(root, prefix).join('\n') };
      } catch (error) {
        return { ok: false, output: (error as Error).message };
      }
    },
  },
  {
    name: 'check_script',
    description:
      'Parse one generated GDScript file with Godot --check-only before verify. Use after compose returns.',
    async run(args, context) {
      const relative = String(args.path ?? '').replaceAll('\\', '/');
      if (!relative.endsWith('.gd')) {
        return { ok: false, output: 'check_script requires a .gd path' };
      }
      try {
        const path = inside(context.outDir, relative);
        if (!existsSync(path)) return { ok: false, output: `script not found: ${relative}` };
        const godot = await detectGodot({ env: context.env, runner: context.runner });
        if (!godot) return { ok: false, output: 'Godot 4.4+ not found' };
        const runner = context.runner ?? runCommand;
        const result = await runner.run(
          godot.bin,
          ['--headless', '--path', context.outDir, '--check-only', '--script', `res://${relative}`],
          { timeoutMs: 60_000 },
        );
        const output = `${result.stdout}\n${result.stderr}`.trim();
        const failed = result.exitCode !== 0 || /parse error|script error|failed to load script/i.test(output);
        return { ok: !failed, output: output || `exit ${result.exitCode}` };
      } catch (error) {
        return { ok: false, output: (error as Error).message };
      }
    },
  },
  {
    name: 'verify',
    description:
      'Run G1/G2/G3 (and optional G6) against the generated project. Fix failures with write_file, then verify again.',
    async run(args, context) {
      const report = await verifyCommand({
        projectDir: context.outDir,
        env: context.env,
        runner: context.runner,
        visual: context.visual,
      });
      const failed = Object.values(report.gates).some((gate) => gate.status === 'fail');
      const missing = missingExpectedMarkers(context.outDir, context.expectedMarkers);
      return {
        ok: !failed && missing.length === 0,
        output: JSON.stringify(
          { gates: report.gates, missingExpectedMarkers: missing },
          null,
          2,
        ),
        data: report,
      };
    },
  },
  {
    name: 'finish',
    description: 'Finish development after verification passes.',
    async run(args) {
      return { ok: true, output: String(args.summary ?? 'finished') };
    },
  },
];

function toolByName(name: string): Tool | undefined {
  return TOOLS.find((tool) => tool.name === name);
}

function parseAction(raw: string): DevelopAction {
  const value = extractJson(raw) as Record<string, unknown>;
  const tool = typeof value.tool === 'string' ? value.tool : '';
  if (!tool) throw new Error('model action has no tool');
  const args =
    typeof value.args === 'object' && value.args !== null
      ? (value.args as Record<string, unknown>)
      : {};
  return { tool, args };
}

function scriptedProvider(): ModelProvider {
  return new FakeProvider({ responses: [...SCRIPTED_ACTIONS] });
}

function systemPrompt(skillText: string): string {
  return [
    'You are GameDream, an autonomous game developer.',
    'You build a playable Godot demo from the user prompt using tools.',
    'Respond with exactly one JSON object per turn: {"tool":"<name>","args":{...}}.',
    'Available tools:',
    ...TOOLS.map((tool) => `- ${tool.name}: ${tool.description}`),
    'Start with scaffold. Verify, inspect failures, patch files with write_file, and verify again.',
    'Call finish only when verification passes.',
    '',
    'Selected skill:',
    skillText,
  ].join('\n');
}

export async function developCommand(options: DevelopOptions): Promise<DevelopReport> {
  const env = options.env ?? process.env;
  const baseSkillPath = join(options.skillsDir, 'gdscript', 'SKILL.md');
  const skillTextPath = join(options.skillsDir, options.skill, 'SKILL.md');
  const skillText = [
    existsSync(baseSkillPath) ? readFileSync(baseSkillPath, 'utf8') : '',
    existsSync(skillTextPath) ? readFileSync(skillTextPath, 'utf8') : '(no skill instructions found)',
  ]
    .filter(Boolean)
    .join('\n\n');
  const provider =
    options.provider ??
    (options.providerKind === 'fake' ||
    (options.providerKind === 'auto' && !env.OPENAI_API_KEY)
      ? scriptedProvider()
      : createProvider({
          kind: options.providerKind,
          env,
          fetchImpl: options.fetchImpl,
        }));
  const context: DevelopContext = {
    ...options,
    projectDir: options.outDir,
    env,
  };
  const system = systemPrompt(skillText);
  let user = `Build this game:\n${options.prompt}\n\nOutput directory: ${options.outDir}`;
  const actions: string[] = [];
  let finished = false;
  let steps = 0;
  let lastVerify: VerifyReport | undefined;
  let lastMissingMarkers: string[] = [];
  const maxSteps = options.maxSteps ?? 12;

  mkdirSync(options.outDir, { recursive: true });

  while (steps < maxSteps) {
    steps += 1;
    const raw = await provider.complete({ system, user, temperature: 0.1 });
    let action: DevelopAction;
    try {
      action = parseAction(raw);
    } catch (error) {
      user += `\n\nPrevious response was invalid: ${(error as Error).message}. Return one JSON action.`;
      continue;
    }
    actions.push(action.tool);
    const tool = toolByName(action.tool);
    if (!tool) {
      user += `\n\nUnknown tool ${action.tool}. Available: ${TOOLS.map((entry) => entry.name).join(', ')}.`;
      continue;
    }
    const result = await tool.run(action.args ?? {}, context);
    if (action.tool === 'verify' && result.data) {
      lastVerify = result.data as VerifyReport;
      lastMissingMarkers = missingExpectedMarkers(context.outDir, options.expectedMarkers);
    }
    user += `\n\nAssistant: ${raw}\nTool ${action.tool} result (${result.ok ? 'ok' : 'error'}):\n${result.output}`;
    if (action.tool === 'finish') {
      const gates = lastVerify?.gates;
      const passed =
        gates?.G1.status === 'pass' &&
        gates?.G2.status === 'pass' &&
        gates?.G3.status === 'pass' &&
        lastMissingMarkers.length === 0;
      if (!passed) {
        user +=
          '\n\nCannot finish: verification has not passed or required case markers are missing. Fix the project and call verify again.';
        continue;
      }
      finished = true;
      break;
    }
  }

  const verify = await verifyCommand({
    projectDir: options.outDir,
    env,
    runner: options.runner,
    visual: options.visual,
  });
  return {
    provider: provider.name,
    skill: options.skill,
    outDir: options.outDir,
    steps,
    actions,
    finished,
    missingMarkers: missingExpectedMarkers(options.outDir, options.expectedMarkers),
    verify,
  };
}
