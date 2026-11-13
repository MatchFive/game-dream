import { describe, expect, it } from 'vitest';
import { FakeProvider } from '../src/provider/fake-provider.js';

describe('FakeProvider', () => {
  it('returns a deterministic draft with a slugged project name', async () => {
    const provider = new FakeProvider();
    const first = await provider.complete({
      system: 'system',
      user: '做一个俯视角动作 RPG，有背包和 1 个敌人',
    });
    const second = await provider.complete({
      system: 'system',
      user: '做一个俯视角动作 RPG，有背包和 1 个敌人',
    });
    expect(first).toBe(second);
    const draft = JSON.parse(first);
    expect(draft.version).toBe(1);
    expect(draft.project.engine).toBe('godot');
    expect(draft.project.name).toMatch(/^[a-z0-9-]+$/);
    expect(draft.genre.primary).toBe('action-rpg');
  });

  it('returns queued responses when configured', async () => {
    const provider = new FakeProvider({ responses: ['first', 'second'] });
    expect(await provider.complete({ system: 's', user: 'u' })).toBe('first');
    expect(await provider.complete({ system: 's', user: 'u' })).toBe('second');
  });

  it('strips the prompt envelope before writing the draft', async () => {
    const provider = new FakeProvider();
    const text = await provider.complete({
      system: 's',
      user: 'Game idea:\n做一个俯视角动作 RPG\n\nReturn the JSON object now.',
    });
    const draft = JSON.parse(text);
    expect(draft.project.name).toBe('gamedream-demo');
    expect(draft.vision.fantasy).toBe('做一个俯视角动作 RPG');
  });
});
