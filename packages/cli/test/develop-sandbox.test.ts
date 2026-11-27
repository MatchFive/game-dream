import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeProvider, type ModelProvider } from '@gamedream/agent';
import { developCommand } from '../src/commands/develop.js';
import { listSkills, resolveSkillDirectory } from '../src/commands/skill-directory.js';

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

  it('resolves skills across multiple Claude Code style roots', () => {
    temporary = mkdtempSync(join(tmpdir(), 'gamedream skill roots '));
    const first = join(temporary, 'first');
    const second = join(temporary, 'second');
    mkdirSync(join(first, 'shared'), { recursive: true });
    mkdirSync(join(second, 'shared'), { recursive: true });
    mkdirSync(join(second, 'extra'), { recursive: true });
    expect(resolveSkillDirectory([first, second], 'extra')).toBe(
      join(second, 'extra'),
    );
    expect(resolveSkillDirectory([first, second], 'shared')).toBe(
      join(first, 'shared'),
    );
    expect(listSkills([first, second]).map((skill) => skill.name)).toEqual([
      'extra',
      'shared',
    ]);
  });
});

describe('multi-root skills integration', () => {
  it('reads a skill from an extra root through developCommand', async () => {
    temporary = mkdtempSync(join(tmpdir(), 'gamedream skill integration '));
    const outDir = join(temporary, 'project');
    const extraRoot = join(temporary, 'extra');
    mkdirSync(join(extraRoot, 'extra-skill'), { recursive: true });
    writeFileSync(join(extraRoot, 'extra-skill', 'SKILL.md'), 'EXTRA_SKILL_TEXT', 'utf8');
    const eventsFile = join(temporary, 'events.jsonl');
    const report = await developCommand({
      prompt: 'skill check',
      outDir,
      skillsDir,
      skillsDirs: [skillsDir, extraRoot],
      skill: 'survivor-demo',
      providerKind: 'fake',
      maxSteps: 2,
      eventsFile,
      provider: new FakeProvider({
        responses: [
          JSON.stringify({
            tool: 'read_skill',
            args: { skill: 'extra-skill', path: 'SKILL.md' },
          }),
          JSON.stringify({ tool: 'finish', args: {} }),
        ],
      }),
    });
    expect(report.actions).toEqual(['read_skill', 'finish']);
    const events = readFileSync(eventsFile, 'utf8')
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line) as { type: string; tool?: string; output?: string });
    const read = events.find((event) => event.type === 'tool/end' && event.tool === 'read_skill');
    expect(read?.output).toContain('EXTRA_SKILL_TEXT');
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
