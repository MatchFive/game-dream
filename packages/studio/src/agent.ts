import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export type AgentRunStatus = 'running' | 'awaiting-approval' | 'finished' | 'failed' | 'canceled';
export type AgentApprovalStatus = 'pending' | 'allowed' | 'denied';

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

export interface AgentReport {
  finished?: boolean;
  steps?: number;
  actions?: string[];
  missingMarkers?: string[];
  provider?: string;
  outDir?: string;
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
}

interface AgentStartInput {
  prompt: string;
  provider?: string;
  skill?: string;
  maxSteps?: number;
  candidates?: number;
  resume?: boolean;
  approvalTools?: string[];
}

interface AgentManagerOptions {
  root: string;
  cliEntry?: string;
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
  if (candidates.some((run) => run.status === 'awaiting-approval')) return 'awaiting-approval';
  if (candidates.some((run) => run.status === 'running')) return 'running';
  if (candidates.length > 0 && candidates.every((run) => run.status === 'finished')) return 'finished';
  if (candidates.some((run) => run.status === 'failed')) return 'failed';
  if (candidates.some((run) => run.status === 'canceled')) return 'canceled';
  return 'running';
}

export class AgentManager {
  private readonly root: string;
  private readonly cliEntry?: string;
  private readonly children = new Map<string, ChildProcess>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly batches = new Map<string, AgentBatch>();
  private activeBatchId?: string;

  constructor(options: AgentManagerOptions) {
    this.root = resolve(options.root);
    this.cliEntry = options.cliEntry;
    this.loadBatches();
  }

  list(): { active?: AgentBatch; batches: AgentBatch[] } {
    const batches = [...this.batches.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
    return {
      active: this.activeBatchId ? this.batches.get(this.activeBatchId) : undefined,
      batches,
    };
  }

  get(id: string): AgentBatch | undefined {
    return this.batches.get(id);
  }

  async start(input: AgentStartInput): Promise<AgentBatch> {
    const prompt = String(input.prompt ?? '').trim();
    if (!prompt) throw new Error('prompt is required');
    if (prompt.length > 6000) throw new Error('prompt is limited to 6000 characters');
    if (!this.cliEntry) throw new Error('agent CLI entry is not configured');
    const active = this.activeBatchId ? this.batches.get(this.activeBatchId) : undefined;
    if (active && (active.status === 'running' || active.status === 'awaiting-approval')) {
      throw new Error('an agent run is already active');
    }
    const count = clampCandidates(input.candidates);
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
        status: 'running',
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
      provider: input.provider === 'fake' ? 'fake' : 'auto',
      skill: input.skill?.trim() || 'survivor-demo',
      createdAt: new Date().toISOString(),
      status: 'running',
      candidates,
    };
    this.batches.set(id, batch);
    this.activeBatchId = id;
    this.persist(batch);
    for (const run of candidates) this.spawn(batch, run, input);
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
    return approval;
  }

  cancel(batchId: string): AgentBatch {
    const batch = this.batches.get(batchId);
    if (!batch) throw new Error('agent batch not found');
    for (const run of batch.candidates) {
      const child = this.children.get(run.id);
      if (child) this.kill(child);
      if (run.status === 'running' || run.status === 'awaiting-approval') {
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
    this.activeBatchId = undefined;
    this.persist(batch);
    return batch;
  }

  apply(batchId: string, runId: string): AgentBatch {
    const batch = this.batches.get(batchId);
    const run = batch?.candidates.find((candidate) => candidate.id === runId);
    if (!batch || !run) throw new Error('agent candidate not found');
    if (run.status !== 'finished') throw new Error('candidate is not finished');
    if (resolve(run.outDir) !== this.root) {
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
    return batch;
  }

  close(): void {
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
    for (const child of this.children.values()) this.kill(child);
    this.children.clear();
  }

  private spawn(batch: AgentBatch, run: AgentRun, input: AgentStartInput): void {
    const rootSkills = join(this.root, 'skills');
    const skillsDir = existsSync(rootSkills)
      ? rootSkills
      : join(dirname(this.cliEntry as string), '..', '..', '..', 'skills');
    const args = [
      this.cliEntry as string,
      'develop',
      '--out',
      run.outDir,
      '--skills',
      skillsDir,
      '--skill',
      batch.skill,
      '--provider',
      batch.provider,
      '--max-steps',
      String(Math.max(1, Math.min(48, Number(input.maxSteps) || 12))),
      '--events-file',
      run.eventsFile,
      '--approval-dir',
      run.approvalDir,
      '--run-id',
      run.id,
      '--ask-tool',
      (input.approvalTools ?? ['scaffold', 'mcp']).join(','),
      batch.prompt,
    ];
    if (batch.candidates.length === 1 && input.resume) args.push('--resume');
    let child: ChildProcess;
    try {
      child = spawn(process.execPath, args, {
        cwd: this.root,
        env: { ...process.env },
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
      this.children.delete(run.id);
      this.stopTimer(run.id);
      this.reconcile(batch);
    });
    child.once('close', (code) => {
      run.exitCode = code ?? undefined;
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
    if (events.length === run.events.length && run.approvals.length > 0) return;
    run.events = events;
    run.approvals = approvalsFromEvents(events);
    for (const event of events) {
      if (event.type === 'run/end') {
        run.report =
          typeof event.report === 'object' && event.report !== null
            ? (event.report as AgentReport)
            : undefined;
        run.score = scoreReport(run.report);
        run.status = run.report?.finished === false ? 'failed' : 'finished';
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
    if (batch.status === 'finished' || batch.status === 'failed' || batch.status === 'canceled') {
      batch.finishedAt ??= new Date().toISOString();
      if (batch.candidates.every((run) => run.status !== 'running' && run.status !== 'awaiting-approval')) {
        this.activeBatchId = undefined;
      }
    }
    this.persist(batch);
  }

  private batchRoot(id: string): string {
    return join(this.root, '.gamedream', 'studio', 'agent', id);
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
            run.status = 'failed';
            run.error = run.error ?? 'agent process was interrupted when the studio restarted';
          }
          run.score = run.score ?? scoreReport(run.report);
        }
        raw.status = batchStatus(raw.candidates);
        this.batches.set(raw.id, raw);
      } catch {
        // Ignore malformed history entries.
      }
    }
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
