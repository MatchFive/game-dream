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

  it('fails when no templates exist', () => {
    const templatesDir = makeTemplates([]);
    expect(() =>
      selectTemplate({ prompt: 'x', genre: 'action-rpg', templatesDir }),
    ).toThrowError(AgentError);
  });
});
