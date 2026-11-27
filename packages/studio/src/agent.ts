import { randomUUID } from 'node:crypto';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
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
import { dirname, join, resolve } from 'node:path';

export type AgentRunStatus =
  | 'queued'
  | 'running'
  | 'awaiting-approval'
  | 'finished'
  | 'budget-exceeded'
  | 'failed'
  | 'canceled';
export type AgentApprovalStatus = 'pending' | 'allowed' | 'denied';
export type AgentToolMode = 'allow' | 'ask' | 'deny';

export const AGENT_POLICY_TOOLS = [
  'scaffold',
  'compose',
  'read_skill',
  'read_file',
  'write_file',
  'list_files',
  'check_script',
  'mcp',
  'verify',
  'playtest',
  'finish',
] as const;

export interface AgentPolicyRule {
  tool: string;
  mode: AgentToolMode;
  arg?: string;
  prefix?: string;
  reason?: string;
}

export interface AgentPolicy {
  default?: AgentToolMode;
  tools?: Record<string, AgentToolMode>;
  rules?: AgentPolicyRule[];
}

export interface AgentEvent {
  seq: number;
  at: string;
  type: string;
  runId?: string;
  [key: string]: unknown;
}

export interface AgentApproval {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  createdAt: string;
  status: AgentApprovalStatus;
  reason?: string;
}

export interface AgentBackup {
  path: string;
  runId: string;
  createdAt: string;
  entries: string[];
}

export interface AgentFileDiff {
  path: string;
  status: 'added' | 'modified' | 'unchanged';
}

export interface AgentDiff {
  runId: string;
  counts: {
    added: number;
    modified: number;
    unchanged: number;
  };
  files: AgentFileDiff[];
}

export interface AgentUsage {
  calls?: number;
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number;
  costUsd?: number;
}

export interface AgentBudgetExceeded {
  kind: 'total-tokens' | 'prompt-tokens' | 'cost';
  limit: number;
  used: number;
}

export interface AgentReport {
  finished?: boolean;
  steps?: number;
  actions?: string[];
  missingMarkers?: string[];
  provider?: string;
  outDir?: string;
  usage?: AgentUsage;
  budgetExceeded?: AgentBudgetExceeded;
  verify?: {
    gates?: Record<string, { status?: string; message?: string }>;
  };
  [key: string]: unknown;
}

export interface AgentRun {
  id: string;
  index: number;
  count: number;
  outDir: string;
  eventsFile: string;
  approvalDir: string;
  startedAt: string;
  finishedAt?: string;
  status: AgentRunStatus;
  events: AgentEvent[];
  approvals: AgentApproval[];
  report?: AgentReport;
  error?: string;
  score?: number;
  exitCode?: number;
  pid?: number;
  log?: string;
}

export interface AgentBatch {
  id: string;
  prompt: string;
  provider: string;
  skill: string;
  createdAt: string;
  finishedAt?: string;
  status: AgentRunStatus;
  candidates: AgentRun[];
  selectedRunId?: string;
  appliedRunId?: string;
  maxSteps?: number;
  maxTokens?: number;
  maxPromptTokens?: number;
  maxCostUsd?: number;
  approvalTools?: string[];
  resume?: boolean;
  retryOf?: string;
  lastBackup?: AgentBackup;
  permissions?: string;
}

interface AgentStartInput {
  prompt: string;
  provider?: string;
  skill?: string;
  maxSteps?: number;
  candidates?: number;
  resume?: boolean;
  approvalTools?: string[];
  maxTokens?: number;
  maxPromptTokens?: number;
  maxCostUsd?: number;
}

interface AgentManagerOptions {
  root: string;
  cliEntry?: string;
  env?: NodeJS.ProcessEnv;
  provider?: 'auto' | 'fake' | 'openai';
}

const SKIP_APPLY = new Set([
  '.git',
  '.gamedream',
  'node_modules',
  'Library',
  'Temp',
  'obj',
  'dist',
  'build',
  '.env',
]);

function clampCandidates(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.max(1, Math.min(3, Math.trunc(number)));
}

function scoreReport(report: AgentReport | undefined): number | undefined {
  if (!report) return undefined;
  const gates = report.verify?.gates ?? {};
  const gateScore =
    (gates.G1?.status === 'pass' ? 100 : 0) +
    (gates.G2?.status === 'pass' ? 100 : 0) +
    (gates.G3?.status === 'pass' ? 100 : 0);
  const colors = Number(/(\d+) colors/.exec(gates.G6?.message ?? '')?.[1] ?? 0);
  return (report.finished ? 1000 : 0) +
    ((report.missingMarkers?.length ?? 0) === 0 ? 100 : 0) +
    gateScore +
    colors;
}

function readEvents(file: string): AgentEvent[] {
  if (!existsSync(file)) return [];
  const events: AgentEvent[] = [];
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as AgentEvent;
      if (typeof parsed.seq === 'number' && typeof parsed.type === 'string') events.push(parsed);
    } catch {
      // A partial last line is expected while the child is writing.
    }
  }
  return events.sort((left, right) => left.seq - right.seq);
}

function approvalsFromEvents(events: AgentEvent[]): AgentApproval[] {
  const approvals = new Map<string, AgentApproval>();
  for (const event of events) {
    if (event.type === 'approval/request') {
      const id = String(event.id ?? '');
      if (!id) continue;
      approvals.set(id, {
        id,
        tool: String(event.tool ?? 'tool'),
        args:
          typeof event.args === 'object' && event.args !== null
            ? (event.args as Record<string, unknown>)
            : {},
        createdAt: event.at,
        status: 'pending',
      });
    } else if (event.type === 'approval/decision') {
      const approval = approvals.get(String(event.id ?? ''));
      if (!approval) continue;
      approval.status = event.allowed === true ? 'allowed' : 'denied';
      if (typeof event.reason === 'string') approval.reason = event.reason;
    }
  }
  return [...approvals.values()];
}

function batchStatus(candidates: AgentRun[]): AgentRunStatus {
  if (candidates.length > 0 && candidates.every((run) => run.status === 'queued')) return 'queued';
  if (candidates.some((run) => run.status === 'awaiting-approval')) return 'awaiting-approval';
  if (candidates.some((run) => run.status === 'running')) return 'running';
  if (candidates.length > 0 && candidates.every((run) => run.status === 'finished')) return 'finished';
  if (candidates.some((run) => run.status === 'budget-exceeded')) return 'budget-exceeded';
  if (candidates.some((run) => run.status === 'failed')) return 'failed';
  if (candidates.some((run) => run.status === 'canceled')) return 'canceled';
  return 'running';
}

function optionalTokenLimit(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return undefined;
  return Math.trunc(number);
}

function optionalCostLimit(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return undefined;
  return number;
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function processCommandLine(pid: number): string | undefined {
  try {
    if (process.platform === 'win32') {
      const result = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
        ],
        { encoding: 'utf8', timeout: 5000, windowsHide: true },
      );
      return result.stdout?.trim() || undefined;
    }
    if (process.platform === 'linux') {
      return readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim();
    }
    const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], {
      encoding: 'utf8',
      timeout: 5000,
    });
    return result.stdout?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function killPidTree(pid: number): void {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'], {
      timeout: 10_000,
      windowsHide: true,
    });
  } else {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // The process may have exited between the identity check and kill.
    }
  }
}

function listCandidateFiles(root: string, prefix = ''): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (SKIP_APPLY.has(entry.name)) continue;
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...listCandidateFiles(join(root, entry.name), relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

export class AgentManager {
  private readonly root: string;
  private readonly cliEntry?: string;
  private env: NodeJS.ProcessEnv;
  private defaultProvider: 'auto' | 'fake' | 'openai';
  private readonly children = new Map<string, ChildProcess>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly batches = new Map<string, AgentBatch>();
  private readonly listeners = new Set<() => void>();
  private readonly queue: string[] = [];
  private activeBatchId?: string;

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  constructor(options: AgentManagerOptions) {
    this.root = resolve(options.root);
    this.cliEntry = options.cliEntry;
    this.env = { ...(options.env ?? {}) };
    this.defaultProvider = options.provider ?? 'auto';
    this.loadBatches();
    this.recoverInterrupted();
  }

  setEnv(env: NodeJS.ProcessEnv): void {
    this.env = { ...env };
  }

  setDefaultProvider(provider: 'auto' | 'fake' | 'openai'): void {
    this.defaultProvider = provider;
  }

  list(): { active?: AgentBatch; queued: AgentBatch[]; batches: AgentBatch[] } {
    const batches = [...this.batches.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
    return {
      active: this.activeBatchId ? this.batches.get(this.activeBatchId) : undefined,
      queued: this.queue
        .map((id) => this.batches.get(id))
        .filter((batch): batch is AgentBatch => batch !== undefined),
      batches,
    };
  }

  get(id: string): AgentBatch | undefined {
    return this.batches.get(id);
  }

  getPolicy(): AgentPolicy {
    const path = this.policyPath();
    if (!existsSync(path)) return { default: 'allow', tools: { scaffold: 'ask', mcp: 'ask' } };
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as AgentPolicy;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  updatePolicy(tool: string, mode: AgentToolMode): AgentPolicy {
    if (!tool || !['allow', 'ask', 'deny'].includes(mode)) {
      throw new Error('invalid permission policy update');
    }
    const policy = this.getPolicy();
    policy.tools = { ...(policy.tools ?? {}), [tool]: mode };
    policy.default ??= 'allow';
    this.writePolicy(policy);
    return policy;
  }

  updateDefaultPolicy(mode: AgentToolMode): AgentPolicy {
    if (!['allow', 'ask', 'deny'].includes(mode)) {
      throw new Error('invalid permission policy update');
    }
    const policy = this.getPolicy();
    policy.default = mode;
    this.writePolicy(policy);
    return policy;
  }

  addPolicyRule(rule: AgentPolicyRule): AgentPolicy {
    if (
      !rule
      || typeof rule.tool !== 'string'
      || !rule.tool.trim()
      || !['allow', 'ask', 'deny'].includes(rule.mode)
      || (rule.arg !== undefined && typeof rule.arg !== 'string')
      || (rule.prefix !== undefined && typeof rule.prefix !== 'string')
    ) {
      throw new Error('invalid permission rule');
    }
    const policy = this.getPolicy();
    policy.rules = [...(policy.rules ?? []), {
      tool: rule.tool.trim(),
      mode: rule.mode,
      ...(rule.arg?.trim() ? { arg: rule.arg.trim() } : {}),
      ...(rule.prefix !== undefined ? { prefix: rule.prefix } : {}),
      ...(rule.reason?.trim() ? { reason: rule.reason.trim().slice(0, 300) } : {}),
    }];
    policy.default ??= 'allow';
    this.writePolicy(policy);
    return policy;
  }

  removePolicyRule(index: number): AgentPolicy {
    const policy = this.getPolicy();
    if (!Array.isArray(policy.rules) || !Number.isInteger(index) || index < 0 || index >= policy.rules.length) {
      throw new Error('permission rule not found');
    }
    policy.rules.splice(index, 1);
    this.writePolicy(policy);
    return policy;
  }

  private writePolicy(policy: AgentPolicy): void {
    const path = this.policyPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(policy, null, 2)}\n`, 'utf8');
    this.notify();
  }

  async start(input: AgentStartInput): Promise<AgentBatch> {
    const prompt = String(input.prompt ?? '').trim();
    if (!prompt) throw new Error('prompt is required');
    if (prompt.length > 6000) throw new Error('prompt is limited to 6000 characters');
    if (!this.cliEntry) throw new Error('agent CLI entry is not configured');
    const count = clampCandidates(input.candidates);
    const maxSteps = Math.max(1, Math.min(48, Number(input.maxSteps) || 12));
    const maxTokens = optionalTokenLimit(input.maxTokens);
    const maxPromptTokens = optionalTokenLimit(input.maxPromptTokens);
    const maxCostUsd = optionalCostLimit(input.maxCostUsd);
    const policyPath = this.policyPath();
    const hasPolicy = existsSync(policyPath);
    const approvalTools = input.approvalTools ?? (hasPolicy ? [] : ['scaffold', 'mcp']);
    const id = `agent-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
    const batchRoot = this.batchRoot(id);
    mkdirSync(batchRoot, { recursive: true });
    const candidates: AgentRun[] = [];
    for (let index = 1; index <= count; index += 1) {
      const runDir = join(batchRoot, `candidate-${index}`);
      mkdirSync(runDir, { recursive: true });
      const run: AgentRun = {
        id: `${id}-${index}`,
        index,
        count,
        outDir: count === 1 ? this.root : join(runDir, 'project'),
        eventsFile: join(runDir, 'events.jsonl'),
        approvalDir: join(runDir, 'approvals'),
        startedAt: new Date().toISOString(),
        status: 'queued',
        events: [],
        approvals: [],
      };
      mkdirSync(run.approvalDir, { recursive: true });
      writeFileSync(run.eventsFile, '', 'utf8');
      candidates.push(run);
    }
    const batch: AgentBatch = {
      id,
      prompt,
      provider: input.provider === 'fake' || input.provider === 'openai'
        ? input.provider
        : this.defaultProvider,
      skill: input.skill?.trim() || 'survivor-demo',
      createdAt: new Date().toISOString(),
      status: 'queued',
      candidates,
      maxSteps,
      maxTokens,
      maxPromptTokens,
      maxCostUsd,
      approvalTools,
      resume: input.resume === true,
      permissions: hasPolicy ? policyPath : undefined,
    };
    this.batches.set(id, batch);
    this.queue.push(id);
    this.persist(batch);
    this.pumpQueue();
    this.notify();
    return batch;
  }

  approve(
    batchId: string,
    runId: string,
    approvalId: string,
    allowed: boolean,
    reason?: string,
  ): AgentApproval {
    const batch = this.batches.get(batchId);
    const run = batch?.candidates.find((candidate) => candidate.id === runId);
    const approval = run?.approvals.find((entry) => entry.id === approvalId);
    if (!batch || !run || !approval) throw new Error('approval request not found');
    if (approval.status !== 'pending') return approval;
    const file = join(run.approvalDir, `${approvalId}.decision.json`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      `${JSON.stringify({ allowed, reason, decidedAt: new Date().toISOString() }, null, 2)}\n`,
      'utf8',
    );
    approval.status = allowed ? 'allowed' : 'denied';
    if (reason) approval.reason = reason;
    this.persist(batch);
    this.notify();
    return approval;
  }

  async retry(batchId: string): Promise<AgentBatch> {
    const previous = this.batches.get(batchId);
    if (!previous) throw new Error('agent batch not found');
    if (!['failed', 'canceled', 'budget-exceeded'].includes(previous.status)) {
      throw new Error('only failed, canceled, or budget-exceeded batches can be retried');
    }
    const batch = await this.start({
      prompt: previous.prompt,
      provider: previous.provider,
      skill: previous.skill,
      maxSteps: previous.maxSteps,
      maxTokens: previous.maxTokens,
      maxPromptTokens: previous.maxPromptTokens,
      maxCostUsd: previous.maxCostUsd,
      approvalTools: previous.approvalTools,
      resume: false,
    });
    batch.retryOf = previous.id;
    this.persist(batch);
    this.notify();
    return batch;
  }

  cancel(batchId: string): AgentBatch {
    const batch = this.batches.get(batchId);
    if (!batch) throw new Error('agent batch not found');
    const queuedIndex = this.queue.indexOf(batchId);
    if (queuedIndex >= 0) this.queue.splice(queuedIndex, 1);
    const wasActive = this.activeBatchId === batchId;
    for (const run of batch.candidates) {
      const child = this.children.get(run.id);
      if (child) this.kill(child);
      if (
        run.status === 'queued'
        || run.status === 'running'
        || run.status === 'awaiting-approval'
      ) {
        run.status = 'canceled';
        run.finishedAt = new Date().toISOString();
        run.events.push({
          seq: run.events.length + 1,
          at: new Date().toISOString(),
          type: 'run/canceled',
        });
      }
    }
    batch.status = 'canceled';
    batch.finishedAt = new Date().toISOString();
    if (wasActive) this.activeBatchId = undefined;
    this.persist(batch);
    this.notify();
    if (wasActive) this.pumpQueue();
    return batch;
  }

  diff(batchId: string, runId: string): AgentDiff {
    const batch = this.batches.get(batchId);
    const run = batch?.candidates.find((candidate) => candidate.id === runId);
    if (!batch || !run) throw new Error('agent candidate not found');
    if (resolve(run.outDir) === this.root) {
      return { runId, counts: { added: 0, modified: 0, unchanged: 0 }, files: [] };
    }
    const files: AgentFileDiff[] = [];
    for (const relativePath of listCandidateFiles(run.outDir)) {
      const candidateFile = join(run.outDir, relativePath);
      const currentFile = join(this.root, relativePath);
      let status: AgentFileDiff['status'] = 'added';
      if (existsSync(currentFile)) {
        const sameSize = statSync(candidateFile).size === statSync(currentFile).size;
        status = sameSize && readFileSync(candidateFile).equals(readFileSync(currentFile))
          ? 'unchanged'
          : 'modified';
      }
      files.push({ path: relativePath, status });
    }
    files.sort((left, right) => {
      const rank = { added: 0, modified: 1, unchanged: 2 };
      return rank[left.status] - rank[right.status] || left.path.localeCompare(right.path);
    });
    return {
      runId,
      counts: {
        added: files.filter((file) => file.status === 'added').length,
        modified: files.filter((file) => file.status === 'modified').length,
        unchanged: files.filter((file) => file.status === 'unchanged').length,
      },
      files,
    };
  }

  apply(batchId: string, runId: string): AgentBatch {
    const batch = this.batches.get(batchId);
    const run = batch?.candidates.find((candidate) => candidate.id === runId);
    if (!batch || !run) throw new Error('agent candidate not found');
    if (run.status !== 'finished') throw new Error('candidate is not finished');
    if (resolve(run.outDir) !== this.root) {
      batch.lastBackup = this.createBackup(batch, run);
      for (const entry of readdirSync(run.outDir)) {
        if (SKIP_APPLY.has(entry)) continue;
        cpSync(join(run.outDir, entry), join(this.root, entry), {
          recursive: true,
          force: true,
        });
      }
    }
    batch.selectedRunId = run.id;
    batch.appliedRunId = run.id;
    this.persist(batch);
    this.notify();
    return batch;
  }

  rollback(batchId: string): AgentBatch {
    const batch = this.batches.get(batchId);
    if (!batch) throw new Error('agent batch not found');
    const backup = batch.lastBackup;
    if (!backup) throw new Error('no applied candidate backup');
    for (const entry of backup.entries) {
      if (SKIP_APPLY.has(entry)) continue;
      const target = join(this.root, entry);
      rmSync(target, { recursive: true, force: true });
      const source = join(backup.path, entry);
      if (existsSync(source)) {
        cpSync(source, target, { recursive: true, force: true });
      }
    }
    batch.lastBackup = undefined;
    batch.appliedRunId = undefined;
    this.persist(batch);
    this.notify();
    return batch;
  }

  deleteBatch(batchId: string): string[] {
    const batch = this.batches.get(batchId);
    if (!batch) throw new Error('agent batch not found');
    if (this.activeBatchId === batchId || ['running', 'awaiting-approval', 'queued'].includes(batch.status)) {
      throw new Error('cannot delete an active or queued batch');
    }
    rmSync(this.batchRoot(batch.id), { recursive: true, force: true });
    this.batches.delete(batch.id);
    this.queue.splice(0, this.queue.length, ...this.queue.filter((id) => id !== batch.id));
    this.notify();
    return [batch.id];
  }

  clearFinished(): string[] {
    const removed: string[] = [];
    for (const batch of [...this.batches.values()]) {
      if (batch.id === this.activeBatchId) continue;
      if (['running', 'awaiting-approval', 'queued'].includes(batch.status)) continue;
      rmSync(this.batchRoot(batch.id), { recursive: true, force: true });
      this.batches.delete(batch.id);
      removed.push(batch.id);
    }
    if (removed.length > 0) this.notify();
    return removed;
  }

  close(): void {
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
    for (const child of this.children.values()) this.kill(child);
    this.children.clear();
    this.queue.length = 0;
  }

  private createBackup(batch: AgentBatch, run: AgentRun): AgentBackup {
    const directory = join(
      this.batchRoot(batch.id),
      'backups',
      `${Date.now()}-${run.id}`,
    );
    mkdirSync(directory, { recursive: true });
    const entries = readdirSync(run.outDir).filter((entry) => !SKIP_APPLY.has(entry));
    for (const entry of entries) {
      const source = join(this.root, entry);
      if (!existsSync(source)) continue;
      cpSync(source, join(directory, entry), { recursive: true, force: true });
    }
    return {
      path: directory,
      runId: run.id,
      createdAt: new Date().toISOString(),
      entries,
    };
  }

  private spawn(
    batch: AgentBatch,
    run: AgentRun,
    input: AgentStartInput,
    eventSeqStart = 0,
  ): void {
    const splitPaths = (value: string | undefined): string[] => {
      if (!value) return [];
      return value.split(/[;,]/).map((entry) => entry.trim()).filter(Boolean);
    };
    const repoSkills = join(dirname(this.cliEntry as string), '..', '..', '..', 'skills');
    const skillsDirs = [...new Set([
      join(this.root, '.claude', 'skills'),
      join(this.root, '.commandcode', 'skills'),
      join(this.root, 'skills'),
      ...splitPaths(this.env.GAMEDREAM_SKILLS_DIRS),
      repoSkills,
    ].filter(Boolean))];
    const mcpConfigs = [
      ...splitPaths(this.env.GAMEDREAM_MCP_CONFIGS),
      join(this.root, '.mcp.json'),
      join(this.root, '.commandcode', 'mcp.json'),
    ].filter((path, index, all) => existsSync(path) && all.indexOf(path) === index);
    const maxSteps = Math.max(1, Math.min(48, Number(input.maxSteps) || batch.maxSteps || 12));
    const maxTokens = optionalTokenLimit(input.maxTokens ?? batch.maxTokens);
    const maxPromptTokens = optionalTokenLimit(input.maxPromptTokens ?? batch.maxPromptTokens);
    const maxCostUsd = optionalCostLimit(input.maxCostUsd ?? batch.maxCostUsd);
    const approvalTools = input.approvalTools ?? batch.approvalTools ?? ['scaffold', 'mcp'];
    const permissions = batch.permissions;
    const args = [
      this.cliEntry as string,
      'develop',
      '--out',
      run.outDir,
      '--skills',
      skillsDirs.join(','),
      '--skill',
      batch.skill,
      '--provider',
      batch.provider,
      '--max-steps',
      String(maxSteps),
      '--events-file',
      run.eventsFile,
      '--approval-dir',
      run.approvalDir,
      '--run-id',
      run.id,
      '--ask-tool',
      approvalTools.join(','),
    ];
    if (mcpConfigs.length > 0) args.push('--mcp-config', mcpConfigs.join(','));
    if (maxTokens !== undefined) args.push('--max-tokens', String(maxTokens));
    if (maxPromptTokens !== undefined) args.push('--max-prompt-tokens', String(maxPromptTokens));
    if (maxCostUsd !== undefined) args.push('--max-cost', String(maxCostUsd));
    if (permissions) args.push('--permissions', permissions);
    if (eventSeqStart > 0) args.push('--event-seq-start', String(eventSeqStart));
    if (input.resume) args.push('--resume');
    args.push('--', batch.prompt);
    let child: ChildProcess;
    try {
      child = spawn(process.execPath, args, {
        cwd: this.root,
        env: { ...process.env, ...this.env },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      run.status = 'failed';
      run.error = (error as Error).message;
      this.reconcile(batch);
      return;
    }
    this.children.set(run.id, child);
    run.pid = child.pid;
    this.persist(batch);
    const log: string[] = [];
    child.stdout?.on('data', (chunk) => {
      log.push(String(chunk));
      if (log.length > 80) log.shift();
      this.persistLog(run, log);
    });
    child.stderr?.on('data', (chunk) => {
      log.push(String(chunk));
      if (log.length > 80) log.shift();
      this.persistLog(run, log);
    });
    child.once('error', (error) => {
      run.status = 'failed';
      run.error = error.message;
      run.pid = undefined;
      this.children.delete(run.id);
      this.stopTimer(run.id);
      this.reconcile(batch);
    });
    child.once('close', (code) => {
      run.exitCode = code ?? undefined;
      run.pid = undefined;
      this.children.delete(run.id);
      this.readRun(batch, run);
      this.stopTimer(run.id);
      if (run.status === 'running' || run.status === 'awaiting-approval') {
        run.status = code === 0 ? 'finished' : 'failed';
        if (code !== 0 && !run.error) {
          run.error = `agent process exited with code ${code ?? 'unknown'}`;
        }
        run.finishedAt = new Date().toISOString();
      }
      this.reconcile(batch);
    });
    const timer = setInterval(() => this.readRun(batch, run), 300);
    this.timers.set(run.id, timer);
    this.readRun(batch, run);
  }

  private readRun(batch: AgentBatch, run: AgentRun): void {
    const events = readEvents(run.eventsFile);
    if (events.length === run.events.length) return;
    run.events = events;
    run.approvals = approvalsFromEvents(events);
    for (const event of events) {
      if (event.type === 'run/end') {
        run.report =
          typeof event.report === 'object' && event.report !== null
            ? (event.report as AgentReport)
            : undefined;
        run.score = scoreReport(run.report);
        if (run.report?.budgetExceeded) {
          run.status = 'budget-exceeded';
          const budget = run.report.budgetExceeded;
          run.error = budget.kind === 'cost'
            ? `cost budget exceeded: $${budget.used.toFixed(6)}/$${budget.limit.toFixed(6)}`
            : `token budget exceeded: ${budget.used}/${budget.limit}`;
        } else {
          run.status = run.report?.finished === false ? 'failed' : 'finished';
        }
        run.finishedAt = event.at;
        if (run.status === 'failed' && !run.error) {
          run.error = 'agent finished without a passing verification';
        }
      } else if (event.type === 'run/error') {
        run.status = 'failed';
        run.error = String(event.error ?? 'agent failed');
        run.finishedAt = event.at;
      } else if (event.type === 'run/canceled') {
        run.status = 'canceled';
        run.finishedAt = event.at;
      }
    }
    const pending = run.approvals.some((approval) => approval.status === 'pending');
    if (pending && run.status === 'running') run.status = 'awaiting-approval';
    else if (!pending && run.status === 'awaiting-approval') run.status = 'running';
    this.reconcile(batch);
  }

  private reconcile(batch: AgentBatch): void {
    batch.status = batchStatus(batch.candidates);
    const terminal = batch.status === 'finished'
      || batch.status === 'failed'
      || batch.status === 'budget-exceeded'
      || batch.status === 'canceled';
    if (terminal) {
      batch.finishedAt ??= new Date().toISOString();
      if (
        this.activeBatchId === batch.id
        && batch.candidates.every((run) => run.status !== 'running' && run.status !== 'awaiting-approval')
      ) {
        this.activeBatchId = undefined;
      }
    }
    this.persist(batch);
    this.notify();
    if (terminal && this.activeBatchId === undefined) this.pumpQueue();
  }

  private pumpQueue(): void {
    if (!this.cliEntry) return;
    if (this.activeBatchId) {
      const active = this.batches.get(this.activeBatchId);
      if (
        active
        && (active.status === 'running'
          || active.status === 'awaiting-approval'
          || active.status === 'queued')
      ) {
        return;
      }
      this.activeBatchId = undefined;
    }
    while (this.queue.length > 0) {
      const id = this.queue.shift();
      if (!id) return;
      const batch = this.batches.get(id);
      if (!batch || batch.status !== 'queued' || batch.candidates.length === 0) continue;
      this.activeBatchId = id;
      batch.status = 'running';
      for (const run of batch.candidates) {
        run.status = 'running';
        run.startedAt = new Date().toISOString();
        run.error = undefined;
        run.finishedAt = undefined;
        this.spawn(batch, run, {
          prompt: batch.prompt,
          provider: batch.provider,
          skill: batch.skill,
          maxSteps: batch.maxSteps,
          maxTokens: batch.maxTokens,
          maxPromptTokens: batch.maxPromptTokens,
          maxCostUsd: batch.maxCostUsd,
          approvalTools: batch.approvalTools,
          resume: batch.resume,
        });
      }
      this.persist(batch);
      this.notify();
      return;
    }
  }

  private batchRoot(id: string): string {
    return join(this.root, '.gamedream', 'studio', 'agent', id);
  }

  private policyPath(): string {
    return join(this.root, '.gamedream', 'studio', 'agent-policy.json');
  }

  private persistLog(run: AgentRun, lines: string[]): void {
    run.log = lines.join('').slice(-12_000);
    try {
      writeFileSync(join(dirname(run.eventsFile), 'agent.log'), run.log, 'utf8');
    } catch {
      // Logging must not break the agent run.
    }
  }

  private persist(batch: AgentBatch): void {
    try {
      const file = join(this.batchRoot(batch.id), 'batch.json');
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(
        file,
        `${JSON.stringify(
          {
            ...batch,
            candidates: batch.candidates.map((run) => ({
              ...run,
              events: undefined,
            })),
          },
          null,
          2,
        )}\n`,
        'utf8',
      );
    } catch {
      // Persistence is best effort; the live process remains usable.
    }
  }

  private loadBatches(): void {
    const root = join(this.root, '.gamedream', 'studio', 'agent');
    if (!existsSync(root)) return;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const file = join(root, entry.name, 'batch.json');
      if (!existsSync(file)) continue;
      try {
        const raw = JSON.parse(readFileSync(file, 'utf8')) as AgentBatch;
        if (!raw?.id || !Array.isArray(raw.candidates)) continue;
        for (const run of raw.candidates) {
          run.events = readEvents(run.eventsFile);
          run.approvals = approvalsFromEvents(run.events);
          if (run.status === 'running' || run.status === 'awaiting-approval') {
            run.status = 'running';
            run.error = undefined;
            run.finishedAt = undefined;
          }
          run.score = run.score ?? scoreReport(run.report);
        }
        raw.status = batchStatus(raw.candidates);
        this.batches.set(raw.id, raw);
        if (this.reapStaleBatch(raw)) this.persist(raw);
      } catch {
        // Ignore malformed history entries.
      }
    }
  }

  private reapStaleBatch(batch: AgentBatch): boolean {
    let changed = false;
    for (const run of batch.candidates) {
      if (!Number.isInteger(run.pid) || (run.pid as number) <= 0) continue;
      const pid = run.pid as number;
      let killed = false;
      let verified = false;
      if (processAlive(pid)) {
        const command = processCommandLine(pid);
        verified = Boolean(command && command.includes(run.id));
        if (verified) {
          killPidTree(pid);
          killed = true;
        }
      }
      const events = readEvents(run.eventsFile);
      const seq = events.reduce((max, event) => Math.max(max, event.seq), 0) + 1;
      appendFileSync(
        run.eventsFile,
        `${JSON.stringify({
          seq,
          at: new Date().toISOString(),
          runId: run.id,
          type: 'run/reaped',
          pid,
          killed,
          verified,
        })}\n`,
        'utf8',
      );
      run.pid = undefined;
      run.events = readEvents(run.eventsFile);
      if (killed) run.error = 'stale agent process reaped on restart';
      changed = true;
    }
    return changed;
  }

  private recoverInterrupted(): void {
    if (!this.cliEntry) return;
    for (const batch of this.batches.values()) {
      const interrupted = batch.candidates.filter(
        (run) => run.status === 'running' || run.status === 'awaiting-approval',
      );
      if (interrupted.length === 0) continue;
      this.activeBatchId = batch.id;
      batch.status = 'running';
      batch.finishedAt = undefined;
      for (const run of interrupted) {
        const events = readEvents(run.eventsFile);
        let maxSeq = events.reduce((max, event) => Math.max(max, event.seq), 0);
        const pending = approvalsFromEvents(events).filter(
          (approval) => approval.status === 'pending',
        );
        for (const approval of pending) {
          maxSeq += 1;
          appendFileSync(
            run.eventsFile,
            `${JSON.stringify({
              seq: maxSeq,
              at: new Date().toISOString(),
              runId: run.id,
              type: 'approval/decision',
              id: approval.id,
              tool: approval.tool,
              allowed: false,
              reason: 'agent interrupted; approval expired',
            })}\n`,
            'utf8',
          );
        }
        run.events = readEvents(run.eventsFile);
        run.approvals = approvalsFromEvents(run.events);
        run.status = 'running';
        run.error = undefined;
        run.finishedAt = undefined;
        this.spawn(
          batch,
          run,
          {
            prompt: batch.prompt,
            provider: batch.provider,
            skill: batch.skill,
            maxSteps: batch.maxSteps,
            maxTokens: batch.maxTokens,
            maxPromptTokens: batch.maxPromptTokens,
            maxCostUsd: batch.maxCostUsd,
            approvalTools: batch.approvalTools,
            resume: true,
          },
          maxSeq + 1,
        );
      }
      this.persist(batch);
      this.notify();
    }
    const queued = [...this.batches.values()]
      .filter((batch) => batch.status === 'queued')
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    for (const batch of queued) {
      if (!this.queue.includes(batch.id)) this.queue.push(batch.id);
    }
    this.pumpQueue();
  }

  private stopTimer(runId: string): void {
    const timer = this.timers.get(runId);
    if (timer) clearInterval(timer);
    this.timers.delete(runId);
  }

  private kill(child: ChildProcess): void {
    if (!child.pid) return;
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
    } else {
      child.kill('SIGTERM');
    }
  }
}
