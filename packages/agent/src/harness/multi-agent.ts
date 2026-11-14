import { AgentLoop } from './loop.js';
import type {
  HarnessLoopOptions,
  HarnessLoopResult,
  HarnessUsage,
} from './loop.js';

export interface NamedAgent<TContext> {
  name: string;
  options: HarnessLoopOptions<TContext>;
}

export interface MultiAgentRunOptions {
  /** Run independent agents concurrently; default is deterministic sequential. */
  parallel?: boolean;
  onAgentDone?: (name: string, result: HarnessLoopResult) => void;
}

export interface MultiAgentResult {
  agents: Array<{ name: string; result: HarnessLoopResult }>;
  finished: boolean;
  actions: string[];
  steps: number;
  usage: HarnessUsage;
}

function emptyUsage(): HarnessUsage {
  return { calls: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0 };
}

function addUsage(total: HarnessUsage, usage: HarnessUsage): void {
  total.calls += usage.calls;
  total.promptTokens += usage.promptTokens;
  total.completionTokens += usage.completionTokens;
  total.cachedTokens += usage.cachedTokens;
}

/**
 * Minimal multi-agent coordinator. Each agent owns an independent AgentLoop,
 * session, plugin tree, and context; results are merged without sharing mutable
 * transcript state.
 */
export class MultiAgentCoordinator<TContext> {
  constructor(private readonly agents: NamedAgent<TContext>[]) {}

  async run(options: MultiAgentRunOptions = {}): Promise<MultiAgentResult> {
    const runOne = async (agent: NamedAgent<TContext>) => {
      const result = await new AgentLoop(agent.options).run();
      options.onAgentDone?.(agent.name, result);
      return { name: agent.name, result };
    };

    const agents = options.parallel
      ? await Promise.all(this.agents.map(runOne))
      : await (async () => {
          const results: Array<{ name: string; result: HarnessLoopResult }> = [];
          for (const agent of this.agents) results.push(await runOne(agent));
          return results;
        })();

    const usage = emptyUsage();
    const actions: string[] = [];
    let steps = 0;
    for (const entry of agents) {
      addUsage(usage, entry.result.usage);
      actions.push(...entry.result.actions);
      steps += entry.result.steps;
    }
    return {
      agents,
      finished: agents.every((entry) => entry.result.finished),
      actions,
      steps,
      usage,
    };
  }
}
