import { describe, expect, it } from 'vitest';
import { AgentLoop } from '../src/harness/loop.js';
import type { HarnessTool } from '../src/harness/loop.js';
import type { ChatRequest, ChatResult, ModelProvider } from '../src/types.js';

describe('AgentLoop native tools', () => {
  it('executes native tool calls and finish without JSON actions', async () => {
    const toolLog: string[] = [];
    const tools: HarnessTool<{ value: string }>[] = [
      {
        name: 'echo',
        description: 'Echo a value',
        async execute(args) {
          toolLog.push(`echo:${String(args.value)}`);
          return { ok: true, output: `echo ${String(args.value)}` };
        },
      },
      {
        name: 'finish',
        description: 'Finish',
        async execute() {
          toolLog.push('finish');
          return { ok: true, output: 'finished' };
        },
      },
    ];
    let turn = 0;
    const provider: ModelProvider = {
      name: 'native-test',
      async complete() {
        throw new Error('legacy complete should not be used');
      },
      async completeChatWithUsage(_request: ChatRequest): Promise<ChatResult> {
        turn += 1;
        if (turn === 1) {
          return {
            content: '',
            toolCalls: [{ id: 'call_1', name: 'echo', arguments: '{"value":"ok"}' }],
            usage: { promptTokens: 10, completionTokens: 2, cachedTokens: 5 },
          };
        }
        return {
          content: '',
          toolCalls: [{ id: 'call_2', name: 'finish', arguments: '{}' }],
          usage: { promptTokens: 12, completionTokens: 1, cachedTokens: 8 },
        };
      },
    };
    const loop = new AgentLoop<{ value: string }>({
      system: 'system',
      initialUser: 'build',
      provider,
      tools,
      context: { value: 'ctx' },
      maxSteps: 4,
      nativeTools: true,
      canFinish: () => ({ ok: true }),
    });
    const result = await loop.run();
    expect(result.finished).toBe(true);
    expect(result.actions).toEqual(['echo', 'finish']);
    expect(toolLog).toEqual(['echo:ok', 'finish']);
    expect(result.usage.promptTokens).toBe(22);
    expect(result.session.messages.some((message) => message.role === 'tool')).toBe(true);
    expect(result.session.checkpoints.map((checkpoint) => checkpoint.label)).toEqual([
      'step 1',
      'step 2',
    ]);
    expect(result.session.fork('cp-1').messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'user',
    ]);
  });
});
