import { describe, expect, it } from 'vitest';
import { AgentSession } from '../src/harness/session.js';

describe('AgentSession', () => {
  it('keeps a stable system prefix and append-only messages', () => {
    const session = new AgentSession('system prompt', 'build a game');
    const before = session.prefixHash();
    session.appendAssistant('{"tool":"scaffold"}');
    session.appendTool('Tool result: ok');
    session.appendUser('continue');
    expect(session.prefixHash()).toBe(before);
    expect(session.requestMessages()[0]).toEqual({
      role: 'system',
      content: 'system prompt',
    });
    expect(session.requestMessages().map((message) => message.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
      'user',
    ]);
  });

  it('round-trips a session for resume', () => {
    const session = new AgentSession('system', 'build');
    session.appendAssistant('next');
    const restored = AgentSession.restore('system', session.toJSON().messages);
    expect(restored.requestMessages()).toEqual(session.requestMessages());
    expect(restored.prefixHash()).toBe(session.prefixHash());
  });

  it('compacts old history only after the budget is exceeded', () => {
    const session = new AgentSession('system', 'build');
    expect(session.compact(10)).toBe(false);
    for (let i = 0; i < 20; i += 1) {
      session.appendTool(`long tool output ${i} ${'x'.repeat(50)}`);
    }
    expect(session.compact(100)).toBe(true);
    expect(session.messages.length).toBeLessThan(22);
    expect(session.requestMessages()[0].content).toBe('system');
    expect(session.transcript()).toContain('compact');
  });

  it('forks without mutating the source session', () => {
    const session = new AgentSession('system', 'build');
    session.appendAssistant('next');
    const fork = session.fork();
    fork.appendUser('branch');
    expect(fork.messages.length).toBe(session.messages.length + 1);
    expect(session.messages.length).toBe(2);
  });

  it('creates durable checkpoints, forks from them, and rewinds', () => {
    const session = new AgentSession('system', 'build');
    session.appendAssistant('first');
    const checkpoint = session.checkpoint('after first');
    session.appendAssistant('second');
    session.appendUser('later');
    const fork = session.fork(checkpoint.id);
    expect(fork.messages.map((message) => message.content)).toEqual(['build', 'first']);
    expect(session.messages.map((message) => message.content)).toEqual([
      'build',
      'first',
      'second',
      'later',
    ]);
    session.rewind(checkpoint.id);
    expect(session.messages.map((message) => message.content)).toEqual(['build', 'first']);
    expect(session.checkpoints).toHaveLength(1);
  });

  it('round-trips checkpoints through JSON and fromJSON', () => {
    const session = new AgentSession('system', 'build');
    session.appendAssistant('first');
    const checkpoint = session.checkpoint('saved');
    session.appendAssistant('second');
    const restored = AgentSession.fromJSON('system', session.toJSON());
    expect(restored.checkpoints).toEqual([checkpoint]);
    expect(restored.fork(checkpoint.id).messages.map((message) => message.content)).toEqual([
      'build',
      'first',
    ]);
  });

  it('rejects unknown checkpoints', () => {
    const session = new AgentSession('system', 'build');
    expect(() => session.fork('missing')).toThrow('unknown checkpoint: missing');
    expect(() => session.rewind('missing')).toThrow('unknown checkpoint: missing');
  });

  it('projects an event log into model messages and ignores lifecycle events', () => {
    const session = new AgentSession('system', 'build');
    session.record('turn/start', 0);
    session.record('step/start', 1);
    session.appendAssistant('next');
    session.appendTool('ok', 'scaffold', true);
    session.record('step/end', 1);
    session.recordTurnEnd(true, 1);
    expect(session.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
    expect(session.events.some((event) => event.type === 'turn/end')).toBe(true);
  });
});
