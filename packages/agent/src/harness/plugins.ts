import type { AgentSession } from './session.js';
import type {
  HarnessLoopResult,
  HarnessTool,
  HarnessToolResult,
} from './loop.js';

export interface PluginStepContext<TContext> {
  session: AgentSession;
  step: number;
  context: TContext;
}

export interface PluginToolContext<TContext> extends PluginStepContext<TContext> {
  tool: string;
  result: HarnessToolResult;
}

/** A replaceable capability unit. Later tools win when names collide. */
export interface HarnessPlugin<TContext> {
  name: string;
  tools?: HarnessTool<TContext>[];
  onStepStart?(context: PluginStepContext<TContext>): void | Promise<void>;
  onToolResult?(context: PluginToolContext<TContext>): void | Promise<void>;
  onFinish?(
    context: PluginStepContext<TContext>,
    result: HarnessLoopResult,
  ): void | Promise<void>;
}

export interface PluginNode<TContext> {
  name: string;
  plugins?: HarnessPlugin<TContext>[];
  children?: PluginNode<TContext>[];
}

/**
 * Depth-first plugin tree. A child can replace a parent's tool by name without
 * changing AgentLoop; hooks run in tree order.
 */
export interface ReadBudgetOptions {
  maxReads?: number;
  message?: string;
}

/**
 * Stop a model from burning its step budget on reconnaissance. After a bounded
 * number of read-only calls it appends one instruction to switch to writing,
 * composing, checking, and verifying.
 */
export function readBudgetPlugin<TContext>(
  options: ReadBudgetOptions = {},
): HarnessPlugin<TContext> {
  const maxReads = options.maxReads ?? 5;
  const message =
    options.message ??
    'You have read enough context. Stop reading files. Make one small, safe improvement with write_file under .gamedream, run compose/check_script/verify, then call finish.';
  let reads = 0;
  let nudged = false;
  return {
    name: 'read-budget',
    async onToolResult({ tool, session }) {
      if (!['read_file', 'read_skill', 'list_files'].includes(tool)) return;
      reads += 1;
      if (reads < maxReads || nudged) return;
      nudged = true;
      session.appendUser(message);
    },
  };
}

export class AgentPluginTree<TContext> {
  private readonly nodes: PluginNode<TContext>[];

  constructor(nodes: PluginNode<TContext>[] = []) {
    this.nodes = nodes;
  }

  flatten(): HarnessPlugin<TContext>[] {
    const plugins: HarnessPlugin<TContext>[] = [];
    const walk = (nodes: PluginNode<TContext>[]) => {
      for (const node of nodes) {
        plugins.push(...(node.plugins ?? []));
        if (node.children) walk(node.children);
      }
    };
    walk(this.nodes);
    return plugins;
  }

  resolveTools(base: HarnessTool<TContext>[]): HarnessTool<TContext>[] {
    const byName = new Map(base.map((tool) => [tool.name, tool]));
    for (const plugin of this.flatten()) {
      for (const tool of plugin.tools ?? []) {
        byName.set(tool.name, tool);
      }
    }
    return [...byName.values()];
  }

  async onStepStart(context: PluginStepContext<TContext>): Promise<void> {
    for (const plugin of this.flatten()) {
      await plugin.onStepStart?.(context);
    }
  }

  async onToolResult(context: PluginToolContext<TContext>): Promise<void> {
    for (const plugin of this.flatten()) {
      await plugin.onToolResult?.(context);
    }
  }

  async onFinish(
    context: PluginStepContext<TContext>,
    result: HarnessLoopResult,
  ): Promise<void> {
    for (const plugin of this.flatten()) {
      await plugin.onFinish?.(context, result);
    }
  }
}
