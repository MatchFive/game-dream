import { existsSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { createInterface } from 'node:readline/promises';

export type ToolPermissionMode = 'allow' | 'deny' | 'ask';

export interface PermissionPolicyRule {
  tool: string;
  mode: ToolPermissionMode;
  arg?: string;
  prefix?: string;
  reason?: string;
}

export interface PermissionPolicy {
  default?: ToolPermissionMode;
  tools?: Record<string, ToolPermissionMode>;
  rules?: PermissionPolicyRule[];
}

export interface PermissionGateOptions {
  policy?: PermissionPolicy;
  interactive?: boolean;
  autoApprove?: boolean;
  prompt?: (tool: string, args: Record<string, unknown>) => Promise<boolean>;
  onDecision?: (audit: PermissionAudit) => void;
}

export interface PermissionDecision {
  allowed: boolean;
  reason?: string;
  mode?: ToolPermissionMode;
  source?: 'rule' | 'tool' | 'default';
  rule?: PermissionPolicyRule;
}

export interface PermissionAudit {
  tool: string;
  args: Record<string, unknown>;
  mode: ToolPermissionMode;
  source: 'rule' | 'tool' | 'default';
  allowed: boolean;
  reason?: string;
  rule?: PermissionPolicyRule;
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

function normalizePermissionPath(value: string): string {
  const unified = value.replace(/\\/g, '/');
  const normalized = posix.normalize(unified);
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
}

function pathMatchesPrefix(value: string, prefix: string): boolean {
  if (prefix === '') return true;
  const normalizedValue = normalizePermissionPath(value);
  const normalizedPrefix = normalizePermissionPath(prefix);
  if (normalizedPrefix === '/') return normalizedValue.startsWith('/');
  return normalizedValue === normalizedPrefix
    || normalizedValue.startsWith(`${normalizedPrefix}/`);
}

function ruleMatches(
  rule: PermissionPolicyRule,
  tool: string,
  args: Record<string, unknown>,
): boolean {
  if (rule.tool !== '*' && rule.tool !== tool) return false;
  if (!rule.arg) return true;
  const value = args[rule.arg];
  const values = Array.isArray(value) ? value : [value];
  return values.some((entry) => (
    typeof entry === 'string'
    && (rule.prefix === undefined || pathMatchesPrefix(entry, rule.prefix))
  ));
}

export class ToolPermissionGate {
  private readonly policy: PermissionPolicy;
  private readonly interactive: boolean;
  private readonly autoApprove: boolean;
  private readonly prompt: (tool: string, args: Record<string, unknown>) => Promise<boolean>;
  private readonly onDecision?: (audit: PermissionAudit) => void;

  constructor(options: PermissionGateOptions = {}) {
    this.policy = options.policy ?? {};
    this.interactive = options.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
    this.autoApprove = options.autoApprove ?? false;
    this.prompt = options.prompt ?? defaultPrompt;
    this.onDecision = options.onDecision;
  }

  async authorize(tool: string, args: Record<string, unknown>): Promise<PermissionDecision> {
    const rules = this.policy.rules ?? [];
    let rule: PermissionPolicyRule | undefined;
    for (let index = rules.length - 1; index >= 0; index -= 1) {
      if (ruleMatches(rules[index], tool, args)) {
        rule = rules[index];
        break;
      }
    }
    const toolMode = this.policy.tools?.[tool];
    const mode = toolMode === 'deny'
      ? 'deny'
      : rule?.mode ?? toolMode ?? this.policy.default ?? 'allow';
    const source = toolMode === 'deny'
      ? 'tool'
      : rule
        ? 'rule'
        : toolMode
          ? 'tool'
          : 'default';
    const audit = (allowed: boolean, reason?: string): PermissionDecision => {
      const decision: PermissionDecision = { allowed, reason, mode, source, rule };
      this.onDecision?.({
        tool,
        args,
        mode,
        source,
        allowed,
        reason,
        rule,
      });
      return decision;
    };
    if (mode === 'allow') return audit(true, rule?.reason);
    if (mode === 'deny') {
      return audit(false, rule?.reason ?? `${tool} is denied by the permission policy`);
    }
    if (this.autoApprove) return audit(true, rule?.reason ?? 'auto-approved');
    if (!this.interactive) {
      return audit(
        false,
        rule?.reason
          ?? `${tool} requires approval; run interactively or pass --yes/allow it in permissions.json`,
      );
    }
    const allowed = await this.prompt(tool, args);
    return allowed
      ? audit(true, rule?.reason)
      : audit(false, `approval declined for ${tool}`);
  }
}
