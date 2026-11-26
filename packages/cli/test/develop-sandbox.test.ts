import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { ModelProvider } from '@gamedream/agent';
import { developCommand } from '../src/commands/develop.js';
import { resolveSkillDirectory } from '../src/commands/skill-directory.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const skillsDir = join(root, 'skills');

let temporary: string | undefined;

afterEach(() => {
  if (temporary) rmSync(temporary, { recursive: true, force: true });
  temporary = undefined;
});

describe('skill directory boundary', () => {
  it('accepts only installed skill directories', () => {
    expect(resolveSkillDirectory(skillsDir, 'survivor-demo')).toBe(
      join(skillsDir, 'survivor-demo'),
    );
    expect(() => resolveSkillDirectory(skillsDir, '../..')).toThrow('unknown skill');
    expect(() => resolveSkillDirectory(skillsDir, '..\\..')).toThrow('unknown skill');
    expect(() => resolveSkillDirectory(skillsDir, '/tmp')).toThrow('unknown skill');
    expect(() => resolveSkillDirectory(skillsDir, 'C:\\Windows')).toThrow('unknown skill');
    expect(() => resolveSkillDirectory(skillsDir, 'missing-skill')).toThrow('unknown skill');
  });

  it('reads skill files only from the resolved directory', () => {
    temporary = mkdtempSync(join(tmpdir(), 'gamedream skills '));
    const localSkills = join(temporary, 'skills');
    const skill = join(localSkills, 'demo');
    mkdirSync(skill, { recursive: true });
    expect(resolveSkillDirectory(localSkills, 'demo')).toBe(skill);
    expect(() => resolveSkillDirectory(localSkills, '..')).toThrow('unknown skill');
    expect(() => resolveSkillDirectory(localSkills, '.')).toThrow('unknown skill');
  });
});

describe('read_skill tool boundary', () => {
  it('does not read outside skillsDir when the model supplies a traversal name', async () => {
    temporary = mkdtempSync(join(tmpdir(), 'gamedream sandbox '));
    const outDir = join(temporary, 'project');
    const eventsFile = join(temporary, 'events.jsonl');
    const provider: ModelProvider = {
      name: 'sandbox-test',
      async complete() {
        throw new Error('legacy complete should not be used');
      },
      async completeChatWithUsage() {
        return {
          content: '',
          toolCalls: [{
            id: 'call_1',
            name: 'read_skill',
            arguments: JSON.stringify({ skill: '../..', path: 'package.json' }),
          }],
          usage: { promptTokens: 1, completionTokens: 0, cachedTokens: 0 },
        };
      },
    };

    await developCommand({
      prompt: 'sandbox check',
      outDir,
      skillsDir,
      skill: 'survivor-demo',
      provider,
      providerKind: 'fake',
      maxSteps: 1,
      eventsFile,
    });

    const events = readFileSync(eventsFile, 'utf8')
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line) as {
        type: string;
        tool?: string;
        ok?: boolean;
        output?: string;
      });
    const read = events.find((event) => event.type === 'tool/end' && event.tool === 'read_skill');
    expect(read).toMatchObject({ ok: false });
    expect(read?.output).toContain('unknown skill');
    expect(read?.output).not.toContain('packageManager');
  });
});
