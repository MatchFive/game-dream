import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import {
  AgentLoop,
  AgentPluginTree,
  AgentSession,
  FakeProvider,
  createProvider,
  readBudgetPlugin,
  type HarnessTool,
  type HarnessToolResult,
  type ModelProvider,
  type ProviderKind,
} from '@gamedream/agent';
import { composeProject } from '@gamedream/core';
import { detectGodot, runCommand, type CommandRunner } from '@gamedream/godot';
import { verifyCommand, type VerifyReport } from './verify.js';
import { McpClient, defaultMcpConfig, type McpTool } from './mcp.js';
import {
  ToolPermissionGate,
  loadPermissionPolicy,
  mergePermissionLists,
} from './permissions.js';

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
  mcpConfig?: string;
  mcpServer?: string;
  resume?: boolean;
  fork?: string;
  readOnly?: boolean;
  candidates?: number;
  cacheBreakpoints?: boolean;
  permissions?: string;
  denyTools?: string[];
  askTools?: string[];
  yes?: boolean;
  eventsFile?: string;
  approvalDir?: string;
  runId?: string;
  eventSeqStart?: number;
  onChunk?: (chunk: string) => void;
}

export interface CandidateReport {
  index: number;
  outDir: string;
  score: number;
  report: DevelopReport;
}

export interface CandidatesReport {
  selected: CandidateReport;
  candidates: CandidateReport[];
}

export interface UsageTotals {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
}

export interface DevelopReport {
  provider: string;
  skill: string;
  outDir: string;
  steps: number;
  actions: string[];
  finished: boolean;
  missingMarkers: string[];
  mcpTools: string[];
  sessionPath: string;
  resumed: boolean;
  forked?: string;
  generation: number;
  usage: UsageTotals;
  verify: VerifyReport;
}

interface DevelopContext extends DevelopOptions {
  projectDir: string;
  mcp?: McpClient;
}

interface Tool {
  name: string;
  description: string;
  run(args: Record<string, unknown>, context: DevelopContext): Promise<HarnessToolResult>;
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

async function checkGdScript(
  context: DevelopContext,
  relative: string,
): Promise<{ ok: boolean; output: string }> {
  const godot = await detectGodot({ env: context.env, runner: context.runner });
  if (!godot) return { ok: false, output: 'Godot 4.4+ not found' };
  const runner = context.runner ?? runCommand;
  const result = await runner.run(
    godot.bin,
    [
      '--headless',
      '--path',
      context.outDir,
      '--check-only',
      '--script',
      `res://${relative}`,
    ],
    { timeoutMs: 60_000 },
  );
  const output = `${result.stdout}\n${result.stderr}`.trim();
  const failed =
    result.exitCode !== 0 ||
    /parse error|script error|failed to load script/i.test(output);
  return { ok: !failed, output: output || `exit ${result.exitCode}` };
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

function readOnlyDenied(context: DevelopContext, tool: string): HarnessToolResult | null {
  return context.readOnly
    ? {
        ok: false,
        output: `Permission denied: ${tool} is mutating; run without --read-only to allow it.`,
      }
    : null;
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
      const denied = readOnlyDenied(context, 'scaffold');
      if (denied) return denied;
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
      const denied = readOnlyDenied(context, 'compose');
      if (denied) return denied;
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
    name: 'read_skill',
    description:
      'Read a skill file, defaulting to SKILL.md. Use this for skill references such as references/details.md.',
    async run(args, context) {
      try {
        const skillName = String(args.skill ?? context.skill);
        const relative = String(args.path ?? 'SKILL.md').replaceAll('\\', '/');
        const root = join(context.skillsDir, skillName);
        const target = inside(root, relative);
        if (!existsSync(target) || statSync(target).isDirectory()) {
          return { ok: false, output: `skill file not found: ${skillName}/${relative}` };
        }
        return { ok: true, output: readFileSync(target, 'utf8').slice(0, 120_000) };
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
      const denied = readOnlyDenied(context, 'write_file');
      if (denied) return denied;
      try {
        const path = inside(context.outDir, String(args.path ?? ''));
        const content = String(args.content ?? '');
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content, 'utf8');
        if (path.endsWith('.gd')) {
          const relativePath = relative(context.outDir, path).replaceAll('\\', '/');
          const checked = await checkGdScript(context, relativePath);
          if (!checked.ok) {
            return {
              ok: false,
              output: `Wrote ${content.length} bytes to ${args.path}, but GDScript check failed:\n${checked.output}`,
            };
          }
        }
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
        return await checkGdScript(context, relative);
      } catch (error) {
        return { ok: false, output: (error as Error).message };
      }
    },
  },
  {
    name: 'mcp',
    description:
      'Call a discovered Godot MCP tool. Args: {"name":"tool_name","arguments":{...}}. Use MCP for editor/scene/UI operations.',
    async run(args, context) {
      const denied = readOnlyDenied(context, 'mcp');
      if (denied) return denied;
      if (!context.mcp) {
        return { ok: false, output: 'MCP is not configured; start with --mcp-config <file>' };
      }
      const name = String(args.name ?? '');
      if (!name) return { ok: false, output: 'mcp requires args.name' };
      const callArgs =
        typeof args.arguments === 'object' && args.arguments !== null
          ? (args.arguments as Record<string, unknown>)
          : {};
      try {
        return { ok: true, output: await context.mcp.call(name, callArgs) };
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
    name: 'playtest',
    description:
      'Run the full verification plus G6 screenshot. Use this as the final playtest gate.',
    async run(_args, context) {
      const report = await verifyCommand({
        projectDir: context.outDir,
        env: context.env,
        runner: context.runner,
        visual: true,
      });
      const failed = Object.values(report.gates).some((gate) => gate.status === 'fail');
      return {
        ok: !failed,
        output: JSON.stringify(report.gates, null, 2),
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

function scriptedProvider(): ModelProvider {
  return new FakeProvider({ responses: [...SCRIPTED_ACTIONS] });
}

function systemPrompt(
  skillText: string,
  mcpTools: McpTool[] = [],
  nativeTools = false,
): string {
  const mcpLines = mcpTools.length
    ? [
        '',
        'Discovered MCP tools (call with tool "mcp", args {name, arguments}):',
        ...mcpTools.map((tool) => `- ${tool.name}: ${tool.description ?? ''}`),
      ]
    : [];
  return [
    'You are GameDream, an autonomous game developer.',
    'You build a playable Godot demo from the user prompt using tools.',
    nativeTools
      ? 'Use the native tool calls supplied by the API. Do not wrap tool calls in a JSON action.'
      : 'Respond with exactly one JSON object per turn: {"tool":"<name>","args":{...}}.',
    'Available tools:',
    ...TOOLS.map((tool) => `- ${tool.name}: ${tool.description}`),
    ...mcpLines,
    'Start with scaffold. Verify, inspect failures, patch files with write_file, and verify again.',
    'Call finish only when verification passes.',
    '',
    'Selected skill:',
    skillText,
  ].join('\n');
}

function reportScore(report: DevelopReport): number {
  const gates = report.verify.gates;
  const gateScore =
    (gates.G1.status === 'pass' ? 100 : 0) +
    (gates.G2.status === 'pass' ? 100 : 0) +
    (gates.G3.status === 'pass' ? 100 : 0);
  const colors = Number(/(\d+) colors/.exec(gates.G6?.message ?? '')?.[1] ?? 0);
  return (report.finished ? 1000 : 0) +
    (report.missingMarkers.length === 0 ? 100 : 0) +
    gateScore +
    colors;
}

export async function developCandidates(
  options: DevelopOptions,
): Promise<CandidatesReport> {
  const count = Math.max(1, Math.min(options.candidates ?? 1, 8));
  const candidates: CandidateReport[] = [];
  for (let index = 0; index < count; index += 1) {
    const outDir = join(options.outDir, `candidate-${index + 1}`);
    rmSync(outDir, { recursive: true, force: true });
    const report = await developCommand({
      ...options,
      outDir,
      candidates: undefined,
    });
    candidates.push({
      index: index + 1,
      outDir,
      score: reportScore(report),
      report,
    });
  }
  const selected = [...candidates].sort((a, b) => b.score - a.score)[0];
  return { selected, candidates };
}

export async function developCommand(options: DevelopOptions): Promise<DevelopReport> {
  const env = options.env ?? process.env;
  const baseSkills = ['gdscript', 'godot-gdscript-patterns', 'godot-ui', 'game-feel'];
  const loadedBaseSkills = baseSkills
    .map((name) => join(options.skillsDir, name, 'SKILL.md'))
    .filter((path) => existsSync(path))
    .map((path) => readFileSync(path, 'utf8'));
  const skillTextPath = join(options.skillsDir, options.skill, 'SKILL.md');
  const selectedSkill = existsSync(skillTextPath)
    ? readFileSync(skillTextPath, 'utf8')
    : '(no skill instructions found)';
  const skillText = [...loadedBaseSkills, selectedSkill].filter(Boolean).join('\n\n');
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
  let mcp: McpClient | undefined;
  const discoveredMcp =
    options.mcpConfig ??
    (options.providerKind === 'fake' ? undefined : defaultMcpConfig());
  if (discoveredMcp) {
    try {
      mcp = await McpClient.connect(discoveredMcp, options.mcpServer ?? 'godot');
    } catch (error) {
      if (options.mcpConfig) throw error;
      // Auto-discovery is best-effort; the project can still be built without MCP.
    }
  }
  const context: DevelopContext = {
    ...options,
    projectDir: options.outDir,
    env,
    mcp,
  };
  const sortedMcpTools = [...(mcp?.tools ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const mcpTools = sortedMcpTools.map((tool) => tool.name);
  const nativeTools = Boolean(provider.completeChatWithUsage);
  const system = systemPrompt(skillText, sortedMcpTools, nativeTools);
  const sessionPath = join(options.outDir, '.gamedream', 'session.json');
  let resumed = false;
  let forked: string | undefined;
  let session: AgentSession;
  if (options.fork && (!options.resume || !existsSync(sessionPath))) {
    throw new Error('--fork requires --resume with a saved session');
  }
  if (options.resume && existsSync(sessionPath)) {
    const saved = JSON.parse(readFileSync(sessionPath, 'utf8')) as {
      events?: unknown;
      messages?: unknown;
      checkpoints?: unknown;
      generation?: unknown;
      parentGeneration?: unknown;
      parentCheckpoint?: unknown;
      generationCreatedAt?: unknown;
    };
    session = AgentSession.fromJSON(system, {
      events: Array.isArray(saved.events)
        ? (saved.events as Parameters<typeof AgentSession.fromJSON>[1]['events'])
        : undefined,
      messages: Array.isArray(saved.messages)
        ? (saved.messages as Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>)
        : [],
      checkpoints: Array.isArray(saved.checkpoints)
        ? (saved.checkpoints as Parameters<typeof AgentSession.fromJSON>[1]['checkpoints'])
        : [],
      generation: typeof saved.generation === 'number' ? saved.generation : undefined,
      parentGeneration:
        typeof saved.parentGeneration === 'number' ? saved.parentGeneration : undefined,
      parentCheckpoint:
        typeof saved.parentCheckpoint === 'string' ? saved.parentCheckpoint : undefined,
      generationCreatedAt:
        typeof saved.generationCreatedAt === 'string' ? saved.generationCreatedAt : undefined,
    });
    resumed = true;
    if (options.fork) {
      session = session.fork(options.fork);
      forked = options.fork;
    }
  } else {
    session = new AgentSession(
      system,
      `Build this game:\n${options.prompt}\n\nOutput directory: ${options.outDir}`,
    );
  }
  mkdirSync(dirname(sessionPath), { recursive: true });
  let eventSeq = options.eventSeqStart ?? 0;
  const emitEvent = (event: Record<string, unknown>) => {
    if (!options.eventsFile) return;
    mkdirSync(dirname(options.eventsFile), { recursive: true });
    appendFileSync(
      options.eventsFile,
      `${JSON.stringify({
        seq: ++eventSeq,
        at: new Date().toISOString(),
        runId: options.runId,
        ...event,
      })}\n`,
      'utf8',
    );
  };
  const saveSession = () => {
    writeFileSync(sessionPath, `${JSON.stringify(session.toJSON(), null, 2)}\n`, 'utf8');
    writeFileSync(`${sessionPath}l`, session.toJSONL(), 'utf8');
  };
  saveSession();
  session.onEvent((event) => emitEvent({ type: 'session/event', event }));
  emitEvent({
    type: 'run/start',
    prompt: options.prompt,
    outDir: options.outDir,
    skill: options.skill,
    provider: provider.name,
    resumed: options.resume === true,
  });
  const requestApproval = async (
    tool: string,
    args: Record<string, unknown>,
  ): Promise<boolean> => {
    if (!options.approvalDir) return false;
    const id = randomUUID();
    const directory = options.approvalDir;
    mkdirSync(directory, { recursive: true });
    const requestPath = join(directory, `${id}.request.json`);
    const decisionPath = join(directory, `${id}.decision.json`);
    writeFileSync(
      requestPath,
      `${JSON.stringify({ id, tool, args, createdAt: new Date().toISOString() }, null, 2)}\n`,
      'utf8',
    );
    emitEvent({ type: 'approval/request', id, tool, args });
    const deadline = Date.now() + 10 * 60_000;
    while (Date.now() < deadline) {
      if (existsSync(decisionPath)) {
        try {
          const decision = JSON.parse(readFileSync(decisionPath, 'utf8')) as {
            allowed?: unknown;
            reason?: unknown;
          };
          const allowed = decision.allowed === true;
          emitEvent({
            type: 'approval/decision',
            id,
            tool,
            allowed,
            reason: typeof decision.reason === 'string' ? decision.reason : undefined,
          });
          return allowed;
        } catch {
          // Wait for the Studio server to finish writing the decision.
        }
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    emitEvent({
      type: 'approval/decision',
      id,
      tool,
      allowed: false,
      reason: 'approval timed out',
    });
    return false;
  };
  let lastVerify: VerifyReport | undefined;
  let lastMissingMarkers: string[] = [];
  const defaultPermissionPath = join(options.outDir, '.gamedream', 'permissions.json');
  const permissionPath =
    options.permissions ??
    (existsSync(defaultPermissionPath) ? defaultPermissionPath : undefined);
  const permissionPolicy = mergePermissionLists(
    loadPermissionPolicy(permissionPath),
    options.denyTools,
    options.askTools,
  );
  const permissionGate = new ToolPermissionGate({
    policy: permissionPolicy,
    autoApprove: options.yes,
    interactive: options.approvalDir ? true : undefined,
    prompt: options.approvalDir ? requestApproval : undefined,
  });
  let finished = false;
  let steps = 0;
  let actions: string[] = [];
  let usage: UsageTotals = {
    calls: 0,
    promptTokens: 0,
    completionTokens: 0,
    cachedTokens: 0,
  };
  const harnessTools: HarnessTool<DevelopContext>[] = TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    execute: async (args, toolContext) => {
      const started = Date.now();
      emitEvent({ type: 'tool/start', tool: tool.name, args });
      const denied = readOnlyDenied(toolContext, tool.name);
      if (denied) {
        emitEvent({
          type: 'tool/end',
          tool: tool.name,
          ok: false,
          output: denied.output,
          durationMs: Date.now() - started,
        });
        return denied;
      }
      const confirmation = await permissionGate.authorize(tool.name, args);
      if (!confirmation.allowed) {
        const output = `Permission denied: ${confirmation.reason ?? tool.name}`;
        emitEvent({
          type: 'tool/end',
          tool: tool.name,
          ok: false,
          output,
          durationMs: Date.now() - started,
        });
        return { ok: false, output };
      }
      try {
        const result = await tool.run(args, toolContext);
        emitEvent({
          type: 'tool/end',
          tool: tool.name,
          ok: result.ok,
          output: result.output.slice(0, 8000),
          durationMs: Date.now() - started,
        });
        return result;
      } catch (error) {
        const output = (error as Error).message;
        emitEvent({
          type: 'tool/end',
          tool: tool.name,
          ok: false,
          output,
          durationMs: Date.now() - started,
        });
        throw error;
      }
    },
  }));
  const loop = new AgentLoop<DevelopContext>({
    system,
    initialUser: `Build this game:\n${options.prompt}\n\nOutput directory: ${options.outDir}`,
    provider,
    tools: harnessTools,
    pluginTree: new AgentPluginTree<DevelopContext>([
      { name: 'develop', plugins: [readBudgetPlugin()] },
    ]),
    context,
    maxSteps: options.maxSteps ?? 12,
    compactChars: 80_000,
    nativeTools,
    stream: Boolean(provider.completeChatStream),
    onChunk: options.onChunk || options.eventsFile
      ? (chunk) => {
          emitEvent({ type: 'assistant/chunk', text: chunk });
          options.onChunk?.(chunk);
        }
      : undefined,
    cacheBreakpoints: options.cacheBreakpoints,
    session,
    canFinish: () => {
      const gates = lastVerify?.gates;
      const ok =
        gates?.G1.status === 'pass' &&
        gates?.G2.status === 'pass' &&
        gates?.G3.status === 'pass' &&
        lastMissingMarkers.length === 0;
      return {
        ok,
        reason: gates
          ? 'verification has not passed or required case markers are missing'
          : 'run verify first',
      };
    },
    onSession: () => saveSession(),
    onToolResult: (tool, result) => {
      appendFileSync(
        join(options.outDir, '.gamedream', 'audit.jsonl'),
        `${JSON.stringify({ tool, ok: result.ok, at: new Date().toISOString() })}\n`,
        'utf8',
      );
      if ((tool === 'verify' || tool === 'playtest') && result.data) {
        lastVerify = result.data as VerifyReport;
        lastMissingMarkers = missingExpectedMarkers(context.outDir, options.expectedMarkers);
      }
    },
  });

  try {
    try {
      const result = await loop.run();
      actions = result.actions;
      steps = result.steps;
      finished = result.finished;
      usage = result.usage;
    } finally {
      mcp?.close();
    }

    const verify = await verifyCommand({
      projectDir: options.outDir,
      env,
      runner: options.runner,
      visual: options.visual,
    });
    const report: DevelopReport = {
      provider: provider.name,
      skill: options.skill,
      outDir: options.outDir,
      steps,
      actions,
      finished,
      missingMarkers: missingExpectedMarkers(options.outDir, options.expectedMarkers),
      mcpTools,
      sessionPath,
      resumed,
      forked,
      generation: session.generation,
      usage,
      verify,
    };
    emitEvent({ type: 'run/end', report });
    return report;
  } catch (error) {
    emitEvent({
      type: 'run/error',
      error: (error as Error).message,
    });
    throw error;
  }
}
