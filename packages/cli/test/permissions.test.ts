import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempDir } from '@gamedream/testing';
import {
  ToolPermissionGate,
  loadPermissionPolicy,
  mergePermissionLists,
} from '../src/commands/permissions.js';

describe('tool permissions', () => {
  it('allows by default and denies explicit tools', async () => {
    const gate = new ToolPermissionGate({ policy: { tools: { write_file: 'deny' } } });
    expect((await gate.authorize('read_file', {})).allowed).toBe(true);
    const denied = await gate.authorize('write_file', {});
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toContain('denied');
  });

  it('denies ask tools in non-interactive runs and auto-approves with yes', async () => {
    const nonInteractive = new ToolPermissionGate({
      policy: { tools: { mcp: 'ask' } },
      interactive: false,
    });
    expect((await nonInteractive.authorize('mcp', {})).allowed).toBe(false);
    const automated = new ToolPermissionGate({
      policy: { tools: { mcp: 'ask' } },
      interactive: false,
      autoApprove: true,
    });
    expect((await automated.authorize('mcp', {})).allowed).toBe(true);
  });

  it('uses a custom interactive prompt', async () => {
    const seen: string[] = [];
    const gate = new ToolPermissionGate({
      policy: { tools: { compose: 'ask' } },
      interactive: true,
      prompt: async (tool) => {
        seen.push(tool);
        return true;
      },
    });
    expect((await gate.authorize('compose', {})).allowed).toBe(true);
    expect(seen).toEqual(['compose']);
  });

  it('applies path-prefix rules and falls back outside the prefix', async () => {
    const audits: Array<{ source: string; allowed: boolean; rule?: unknown }> = [];
    const gate = new ToolPermissionGate({
      policy: {
        default: 'ask',
        tools: { write_file: 'ask' },
        rules: [
          { tool: 'write_file', arg: 'path', prefix: 'src/', mode: 'allow', reason: 'source tree' },
        ],
      },
      interactive: false,
      onDecision: (audit) => audits.push(audit),
    });
    const inside = await gate.authorize('write_file', { path: 'src/main.ts' });
    expect(inside).toMatchObject({ allowed: true, source: 'rule', mode: 'allow' });
    expect(inside.reason).toBe('source tree');
    const outside = await gate.authorize('write_file', { path: '../.env' });
    expect(outside).toMatchObject({ allowed: false, source: 'tool', mode: 'ask' });
    expect(audits).toHaveLength(2);
    expect(audits[0]).toMatchObject({ source: 'rule', allowed: true });
  });

  it('loads a policy file and merges CLI deny/ask lists', () => {
    const file = join(makeTempDir('gamedream permissions '), 'permissions.json');
    writeFileSync(
      file,
      JSON.stringify({ default: 'allow', tools: { write_file: 'ask' } }),
      'utf8',
    );
    const policy = mergePermissionLists(loadPermissionPolicy(file), ['mcp'], ['compose']);
    expect(policy.tools).toMatchObject({
      write_file: 'ask',
      mcp: 'deny',
      compose: 'ask',
    });
  });

  it('keeps an explicit tool deny above a matching allow rule', async () => {
    const gate = new ToolPermissionGate({
      policy: {
        tools: { write_file: 'deny' },
        rules: [
          { tool: 'write_file', arg: 'path', prefix: 'src/', mode: 'allow' },
        ],
      },
      interactive: false,
    });
    expect(await gate.authorize('write_file', { path: 'src/main.ts' })).toMatchObject({
      allowed: false,
      source: 'tool',
      mode: 'deny',
    });
  });

  it('normalizes path prefixes and requires segment boundaries', async () => {
    const gate = new ToolPermissionGate({
      policy: {
        default: 'deny',
        rules: [
          { tool: 'write_file', arg: 'path', prefix: 'src/', mode: 'allow' },
        ],
      },
      interactive: false,
    });
    for (const path of ['./src/main.ts', 'src//main.ts', 'x/../src/main.ts', 'src\\main.ts']) {
      expect(await gate.authorize('write_file', { path })).toMatchObject({
        allowed: true,
        source: 'rule',
      });
    }
    for (const path of ['src2/main.ts', 'x/src/main.ts', '../src/main.ts']) {
      expect(await gate.authorize('write_file', { path })).toMatchObject({
        allowed: false,
        source: 'default',
      });
    }
  });
});
