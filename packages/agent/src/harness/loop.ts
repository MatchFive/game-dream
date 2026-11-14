import { AgentSession } from './session.js';
import { extractJson } from '../intake/extract-json.js';
import type { ChatUsage, ModelProvider } from '../types.js';

export interface HarnessToolResult {
  ok: boolean;
  output: string;
  data?: unknown;
}

export interface HarnessTool<TContext> {
  name: string;
  description: string;
  execute(
    args: Record<string, unknown>,
    context: TContext,
  ): Promise<HarnessToolResult>;
}

export interface HarnessUsage extends ChatUsage {
  calls: number;
}

export interface HarnessLoopOptions<TContext> {
  system: string;
  initialUser: string;
  provider: ModelProvider;
  tools: HarnessTool<TContext>[];
  context: TContext;
  maxSteps: number;
  compactChars?: number;
  session?: AgentSession;
  canFinish: () => { ok: boolean; reason?: string };
  onSession?: (session: AgentSession) => void;
  onToolResult?: (
    tool: string,
    result: HarnessToolResult,
    session: AgentSession,
  ) => void;
}

export interface HarnessLoopResult {
  session: AgentSession;
  actions: string[];
  steps: number;
  finished: boolean;
  usage: HarnessUsage;
}

function parseAction(raw: string): { tool: string; args: Record<string, unknown> } {
  const value = extractJson(raw) as Record<string, unknown>;
  const tool = typeof value.tool === 'string' ? value.tool : '';
  if (!tool) throw new Error('model action has no tool');
  const args =
    typeof value.args === 'object' && value.args !== null
      ? (value.args as Record<string, unknown>)
      : {};
  return { tool, args };
}

/**
 * Small DSH-inspired turn/step driver: model request -> action -> tool ->
 * append-only session -> repeat. Tool execution and finish policy are supplied
 * by the caller so GameDream tools stay outside the generic loop.
 */
export class AgentLoop<TContext> {
  private readonly options: HarnessLoopOptions<TContext>;

  constructor(options: HarnessLoopOptions<TContext>) {
    this.options = options;
  }

  async run(): Promise<HarnessLoopResult> {
    const { options } = this;
    const session =
      options.session ??
      new AgentSession(options.system, options.initialUser);
    const usage: HarnessUsage = {
      calls: 0,
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
    };
    const actions: string[] = [];
    let finished = false;
    let steps = 0;
    const save = () => options.onSession?.(session);

    session.record('turn/start', 0);
    save();
    try {
      while (steps < options.maxSteps) {
        steps += 1;
        session.record('step/start', steps);
        usage.calls += 1;
        let raw: string;
        if (options.provider.completeChatWithUsage) {
          const response = await options.provider.completeChatWithUsage({
            messages: session.requestMessages(),
            temperature: 0.1,
          });
          raw = response.content;
          usage.promptTokens += response.usage?.promptTokens ?? 0;
          usage.completionTokens += response.usage?.completionTokens ?? 0;
          usage.cachedTokens += response.usage?.cachedTokens ?? 0;
        } else if (options.provider.completeChat) {
          raw = await options.provider.completeChat({
            messages: session.requestMessages(),
            temperature: 0.1,
          });
        } else {
          raw = await options.provider.complete({
            system: session.system,
            user: session.transcript(),
            temperature: 0.1,
          });
        }

        let action: { tool: string; args: Record<string, unknown> };
        try {
          action = parseAction(raw);
        } catch (error) {
          session.appendUser(
            `Previous response was invalid: ${(error as Error).message}. Return one JSON action.`,
          );
          save();
          continue;
        }

        actions.push(action.tool);
        const tool = options.tools.find((entry) => entry.name === action.tool);
        if (!tool) {
          session.appendUser(
            `Unknown tool ${action.tool}. Available: ${options.tools.map((entry) => entry.name).join(', ')}.`,
          );
          save();
          continue;
        }

        const result = await tool.execute(action.args, options.context);
        session.appendAssistant(raw);
        session.appendTool(result.output.slice(0, 24_000), action.tool, result.ok);
        options.onToolResult?.(action.tool, result, session);
        session.record('step/end', steps);

        const decision = options.canFinish();
        if (decision.ok) {
          session.appendUser(
            'Verification is clean. Call finish now unless a requested feature is still missing.',
          );
        }
        if (steps === options.maxSteps - 2) {
          session.appendUser(
            'Step budget is almost exhausted. If the requested demo is complete, run verify and call finish now; do not keep reading files.',
          );
        }
        session.compact(options.compactChars);
        save();

        if (action.tool === 'finish') {
          if (!decision.ok) {
            session.appendUser(
              `Cannot finish: ${decision.reason ?? 'verification has not passed'}. Fix the project and call verify again.`,
            );
            save();
            continue;
          }
          finished = true;
          break;
        }
      }
    } finally {
      session.recordTurnEnd(finished, steps);
      save();
    }

    return { session, actions, steps, finished, usage };
  }
}
