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
});
