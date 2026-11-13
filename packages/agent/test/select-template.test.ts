import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { selectTemplate } from '../src/classify/select-template.js';
import { AgentError } from '../src/errors.js';

function makeTemplates(ids: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'gamedream templates '));
  for (const id of ids) {
    mkdirSync(join(root, id), { recursive: true });
    writeFileSync(
      join(root, id, 'template.yaml'),
      `id: ${id}\ngenre: action-rpg\ndimension: 2d\nview: top-down\nmodules:\n  required: [core.events]\n`,
      'utf8',
    );
  }
  return root;
}

describe('selectTemplate', () => {
  it('uses the fixture template for a generic action RPG prompt', () => {
    const templatesDir = makeTemplates(['fixture-minimal', 'roguelike-topdown']);
    const selection = selectTemplate({
      prompt: '做一个俯视角动作 RPG，有背包',
      genre: 'action-rpg',
      templatesDir,
    });
    expect(selection.templateId).toBe('fixture-minimal');
  });

  it('prefers the playable M0 template when it exists', () => {
    const templatesDir = makeTemplates(['fixture-minimal', 'rpg-action-m0']);
    const selection = selectTemplate({
      prompt: '做一个俯视角动作 RPG，有背包和 1 个敌人',
      genre: 'action-rpg',
      templatesDir,
    });
    expect(selection.templateId).toBe('rpg-action-m0');
  });

  it('prefers the full M1 template over M0 when both exist', () => {
    const templatesDir = makeTemplates([
      'fixture-minimal',
      'rpg-action-m0',
      'rpg-action-m1',
    ]);
    const selection = selectTemplate({
      prompt: '做一个俯视角动作 RPG，有背包和 1 个敌人',
      genre: 'action-rpg',
      templatesDir,
    });
    expect(selection.templateId).toBe('rpg-action-m1');
  });

  it('prefers a roguelike template when it exists', () => {
    const templatesDir = makeTemplates(['fixture-minimal', 'roguelike-topdown']);
    const selection = selectTemplate({
      prompt: '做一个 roguelike，随机地牢',
      genre: 'roguelike',
      templatesDir,
    });
    expect(selection.templateId).toBe('roguelike-topdown');
  });

  it('falls back when the preferred template is missing', () => {
    const templatesDir = makeTemplates(['fixture-minimal']);
    const selection = selectTemplate({
      prompt: '做一个 roguelike，随机地牢',
      genre: 'roguelike',
      templatesDir,
    });
    expect(selection.templateId).toBe('fixture-minimal');
    expect(selection.reason).toContain('fallback');
  });

  it('tries later matching rules when the first template is unavailable', () => {
    const templatesDir = makeTemplates(['shooter-topdown']);
    const selection = selectTemplate({
      prompt: '做一个 roguelike 射击游戏',
      genre: 'shooter',
      templatesDir,
    });
    expect(selection.templateId).toBe('shooter-topdown');
  });

  it('fails when no templates exist', () => {
    const templatesDir = makeTemplates([]);
    expect(() =>
      selectTemplate({ prompt: 'x', genre: 'action-rpg', templatesDir }),
    ).toThrowError(AgentError);
  });
});
