import { describe, expect, it } from 'vitest';
import { AgentLoop } from '../src/harness/loop.js';
import type { HarnessTool } from '../src/harness/loop.js';
import { AgentPluginTree } from '../src/harness/plugins.js';
import { MultiAgentCoordinator } from '../src/harness/multi-agent.js';
import type { ChatRequest, ChatResult, ModelProvider } from '../src/types.js';

function nativeProvider(
  calls: Array<{ id: string; name: string; arguments?: string }>,
): ModelProvider {
  let index = 0;
  return {
    name: 'native-test',
    async complete() {
      throw new Error('legacy complete should not be used');
    },
    async completeChatWithUsage(_request: ChatRequest): Promise<ChatResult> {
      const call = calls[Math.min(index, calls.length - 1)];
      index += 1;
      return {
        content: '',
        toolCalls: [
          { id: call.id, name: call.name, arguments: call.arguments ?? '{}' },
        ],
        usage: { promptTokens: 2, completionTokens: 1, cachedTokens: 1 },
      };
    },
  };
}

function finishTools(log: string[]): HarnessTool<{ value: string }>[] {
  return [
    {
      name: 'echo',
      description: 'echo',
      async execute(args) {
        log.push(`echo:${String(args.value)}`);
        return { ok: true, output: 'base' };
      },
    },
    {
      name: 'finish',
      description: 'finish',
      async execute() {
        log.push('finish');
        return { ok: true, output: 'finished' };
      },
    },
  ];
}

describe('P2 plugin tree', () => {
  it('lets a child plugin replace a tool and runs lifecycle hooks', async () => {
    const log: string[] = [];
    const hooks: string[] = [];
    const tree = new AgentPluginTree<{ value: string }>([
      {
        name: 'root',
        plugins: [
          {
            name: 'observer',
            async onStepStart() {
              hooks.push('start');
            },
            async onToolResult(context) {
              hooks.push(`result:${context.tool}`);
            },
            async onFinish() {
              hooks.push('finish');
            },
          },
        ],
        children: [
          {
            name: 'override',
            plugins: [
              {
                name: 'echo-override',
                tools: [
                  {
                    name: 'echo',
                    description: 'overridden echo',
                    async execute() {
                      log.push('plugin-echo');
                      return { ok: true, output: 'plugin' };
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
    const loop = new AgentLoop<{ value: string }>({
      system: 'system',
      initialUser: 'build',
      provider: nativeProvider([
        { id: 'call_1', name: 'echo', arguments: '{"value":"x"}' },
        { id: 'call_2', name: 'finish' },
      ]),
      tools: finishTools(log),
      pluginTree: tree,
      context: { value: 'ctx' },
      maxSteps: 3,
      nativeTools: true,
      canFinish: () => ({ ok: true }),
    });
    const result = await loop.run();
    expect(result.finished).toBe(true);
    expect(result.actions).toEqual(['echo', 'finish']);
    expect(log).toEqual(['plugin-echo', 'finish']);
    expect(hooks).toEqual(['start', 'result:echo', 'start', 'result:finish', 'finish']);
    expect(result.session.messages.some((message) => message.content === 'plugin')).toBe(true);
  });

  it('passes a stable cacheBreakpoint key into provider requests', async () => {
    const requests: ChatRequest[] = [];
    const provider: ModelProvider = {
      name: 'cache-test',
      async complete() {
        throw new Error('legacy complete should not be used');
      },
      async completeChatWithUsage(request) {
        requests.push(request);
        return {
          content: '',
          toolCalls: [{ id: 'finish', name: 'finish', arguments: '{}' }],
          usage: { promptTokens: 1, completionTokens: 1, cachedTokens: 1 },
        };
      },
    };
    const loop = new AgentLoop<{ value: string }>({
      system: 'system',
      initialUser: 'build',
      provider,
      tools: finishTools([]),
      context: { value: 'ctx' },
      maxSteps: 2,
      nativeTools: true,
      cacheBreakpoints: true,
      canFinish: () => ({ ok: true }),
    });
    const result = await loop.run();
    expect(requests[0].cacheKey).toBe(result.session.prefixHash());
  });
});

describe('P2 multi-agent', () => {
  it('runs independent agents and aggregates usage without sharing sessions', async () => {
    const makeAgent = (name: string) => ({
      name,
      options: {
        system: `system-${name}`,
        initialUser: `build-${name}`,
        provider: nativeProvider([{ id: `finish-${name}`, name: 'finish' }]),
        tools: finishTools([]),
        context: { value: name },
        maxSteps: 2,
        nativeTools: true,
        canFinish: () => ({ ok: true }),
      },
    });
    const coordinator = new MultiAgentCoordinator<{ value: string }>([
      makeAgent('planner'),
      makeAgent('coder'),
    ]);
    const result = await coordinator.run({ parallel: true });
    expect(result.finished).toBe(true);
    expect(result.agents.map((agent) => agent.name)).toEqual(['planner', 'coder']);
    expect(result.agents[0].result.session).not.toBe(result.agents[1].result.session);
    expect(result.actions).toEqual(['finish', 'finish']);
    expect(result.usage.calls).toBe(2);
    expect(result.steps).toBe(2);
  });
});
