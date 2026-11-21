import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

export type ToolPermissionMode = 'allow' | 'deny' | 'ask';

export interface PermissionPolicy {
  default?: ToolPermissionMode;
  tools?: Record<string, ToolPermissionMode>;
}

export interface PermissionGateOptions {
  policy?: PermissionPolicy;
  interactive?: boolean;
  autoApprove?: boolean;
  prompt?: (tool: string, args: Record<string, unknown>) => Promise<boolean>;
}

export interface PermissionDecision {
  allowed: boolean;
  reason?: string;
}

export function loadPermissionPolicy(path: string | undefined): PermissionPolicy {
  if (!path) return {};
  if (!existsSync(path)) throw new Error(`permissions file not found: ${path}`);
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as PermissionPolicy;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    throw new Error(`invalid permissions file ${path}: ${(error as Error).message}`);
  }
}

export function mergePermissionLists(
  policy: PermissionPolicy,
  deny: string[] = [],
  ask: string[] = [],
): PermissionPolicy {
  const tools = { ...(policy.tools ?? {}) };
  for (const tool of deny) tools[tool] = 'deny';
  for (const tool of ask) tools[tool] = 'ask';
  return { ...policy, tools };
}

function defaultPrompt(tool: string, args: Record<string, unknown>): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const summary = JSON.stringify(args).slice(0, 220);
  return rl
    .question(`Allow tool "${tool}" with ${summary}? [y/N] `)
    .then((answer) => /^y(es)?$/i.test(answer.trim()))
    .finally(() => rl.close());
}

export class ToolPermissionGate {
  private readonly policy: PermissionPolicy;
  private readonly interactive: boolean;
  private readonly autoApprove: boolean;
  private readonly prompt: (tool: string, args: Record<string, unknown>) => Promise<boolean>;

  constructor(options: PermissionGateOptions = {}) {
    this.policy = options.policy ?? {};
    this.interactive = options.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
    this.autoApprove = options.autoApprove ?? false;
    this.prompt = options.prompt ?? defaultPrompt;
  }

  async authorize(tool: string, args: Record<string, unknown>): Promise<PermissionDecision> {
    const mode = this.policy.tools?.[tool] ?? this.policy.default ?? 'allow';
    if (mode === 'allow') return { allowed: true };
    if (mode === 'deny') {
      return { allowed: false, reason: `${tool} is denied by the permission policy` };
    }
    if (this.autoApprove) return { allowed: true };
    if (!this.interactive) {
      return {
        allowed: false,
        reason: `${tool} requires approval; run interactively or pass --yes/allow it in permissions.json`,
      };
    }
    const allowed = await this.prompt(tool, args);
    return allowed
      ? { allowed: true }
      : { allowed: false, reason: `approval declined for ${tool}` };
  }
}
