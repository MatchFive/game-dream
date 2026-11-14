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
});
