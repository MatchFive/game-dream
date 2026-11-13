import { describe, expect, it } from 'vitest';
import { FakeProvider } from '../src/provider/fake-provider.js';
import { draftGameSpec } from '../src/intake/draft-game-spec.js';
import { AgentError } from '../src/errors.js';
import { extractJson } from '../src/intake/extract-json.js';

const validDraft = {
  version: 1,
  project: {
    name: 'my-game',
    engine: 'godot',
    godot_version: '4.4',
    dimension: '2d',
    view: 'top-down',
    target: ['windows'],
  },
  genre: { primary: 'action-rpg', secondary: [] },
  vision: { fantasy: 'test', pillars: [], references: [] },
  scope: { levels: 1, enemies: 1, bosses: 0, skills: 0, items: 3, quests: 0 },
  systems: { inventory: true, save: true },
  content: { language: 'zh-CN' },
  acceptance: ['项目可启动'],
};

describe('extractJson', () => {
  it('extracts JSON from markdown fences', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('rejects text with no JSON object', () => {
    expect(() => extractJson('no json here')).toThrowError(AgentError);
  });
});

describe('draftGameSpec', () => {
  it('returns a validated draft from a fake provider', async () => {
    const draft = await draftGameSpec({
      prompt: '做一个俯视角动作 RPG',
      provider: new FakeProvider(),
    });
    expect(draft.project.engine).toBe('godot');
    expect(draft.genre.primary).toBe('action-rpg');
  });

  it('repairs once when the first response is invalid JSON', async () => {
    const provider = new FakeProvider({
      responses: ['not json', JSON.stringify(validDraft)],
    });
    const draft = await draftGameSpec({ prompt: 'x', provider });
    expect(draft.project.name).toBe('my-game');
  });

  it('fails after one failed repair', async () => {
    const provider = new FakeProvider({ responses: ['not json', 'still not json'] });
    await expect(draftGameSpec({ prompt: 'x', provider })).rejects.toMatchObject({
      code: 'INVALID_MODEL_JSON',
    });
  });

  it('rejects a draft that fails the GameSpec schema twice', async () => {
    const invalid = JSON.stringify({
      ...validDraft,
      project: { ...validDraft.project, engine: 'cryengine' },
    });
    const provider = new FakeProvider({ responses: [invalid, invalid] });
    await expect(draftGameSpec({ prompt: 'x', provider })).rejects.toMatchObject({
      code: 'INVALID_GAME_SPEC',
    });
  });
});
