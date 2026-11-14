import { createHash } from 'node:crypto';
import type { ChatMessage, ChatToolCall } from '../types.js';

export type SessionEvent =
  | { type: 'user/message'; content: string }
  | { type: 'assistant/message'; content: string }
  | { type: 'assistant/tool_calls'; content: string; calls: ChatToolCall[] }
  | { type: 'tool/result'; tool: string; ok: boolean; content: string; callId?: string }
  | { type: 'turn/start'; step: number }
  | { type: 'step/start'; step: number }
  | { type: 'step/end'; step: number }
  | { type: 'turn/end'; finished: boolean; steps: number }
  | { type: 'session/compact'; messages: ChatMessage[] };

/**
 * Append-only session log with a model-message projection.
 *
 * The system prompt is kept outside the mutable transcript so a provider can
 * reuse the same byte-stable prefix across steps. Events preserve facts for
 * replay/telemetry; only message events project into the model request.
 */
export class AgentSession {
  readonly system: string;
  events: SessionEvent[] = [];
  private readonly initialUser: ChatMessage;

  constructor(system: string, user: string) {
    this.system = system;
    this.initialUser = { role: 'user', content: user };
    this.events.push({ type: 'user/message', content: user });
  }

  get messages(): ChatMessage[] {
    const messages: ChatMessage[] = [];
    for (const event of this.events) {
      if (event.type === 'user/message') messages.push({ role: 'user', content: event.content });
      else if (event.type === 'assistant/message') {
        messages.push({ role: 'assistant', content: event.content });
      } else if (event.type === 'assistant/tool_calls') {
        messages.push({
          role: 'assistant',
          content: event.content,
          toolCalls: event.calls,
        });
      } else if (event.type === 'tool/result') {
        messages.push(
          event.callId
            ? {
                role: 'tool',
                content: event.content,
                toolCallId: event.callId,
                name: event.tool,
              }
            : {
                role: 'user',
                content: `Tool ${event.tool} result (${event.ok ? 'ok' : 'error'}):\n${event.content}`,
              },
        );
      } else if (event.type === 'session/compact') {
        messages.splice(0, messages.length, ...event.messages);
      }
    }
    return messages;
  }

  appendAssistant(content: string): void {
    this.events.push({ type: 'assistant/message', content });
  }

  appendAssistantToolCalls(content: string, calls: ChatToolCall[]): void {
    this.events.push({ type: 'assistant/tool_calls', content, calls });
  }

  appendTool(content: string, tool = 'tool', ok = true, callId?: string): void {
    this.events.push({ type: 'tool/result', tool, ok, content, callId });
  }

  appendUser(content: string): void {
    this.events.push({ type: 'user/message', content });
  }

  record(kind: 'turn/start' | 'step/start' | 'step/end', step: number): void {
    this.events.push({ type: kind, step });
  }

  recordTurnEnd(finished: boolean, steps: number): void {
    this.events.push({ type: 'turn/end', finished, steps });
  }

  requestMessages(): ChatMessage[] {
    return [{ role: 'system', content: this.system }, ...this.messages];
  }

  transcript(): string {
    return this.messages
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join('\n\n');
  }

  prefixHash(): string {
    return createHash('sha256').update(this.system).digest('hex');
  }

  charCount(): number {
    return this.messages.reduce((total, message) => total + message.content.length, 0);
  }

  /**
   * Keep the stable initial user request and the newest exchange, replacing
   * older tool output with a small summary. This intentionally breaks the
   * cache only when the context budget is actually exceeded.
   */
  compact(maxChars = 80_000): boolean {
    if (this.charCount() <= maxChars || this.messages.length <= 8) return false;
    const recent = this.messages.slice(-16);
    this.events.push({
      type: 'session/compact',
      messages: [
        this.initialUser,
        {
          role: 'user',
          content:
            '[Earlier tool history compacted to fit the context budget. Re-read files if exact content is needed.]',
        },
        ...recent,
      ],
    });
    return true;
  }

  static restore(system: string, messages: ChatMessage[]): AgentSession {
    const firstUser = messages.find((message) => message.role === 'user');
    const session = new AgentSession(system, firstUser?.content ?? '');
    session.events = messages.map((message) => {
      if (message.role === 'assistant') {
        return { type: 'assistant/message', content: message.content };
      }
      if (message.role === 'user') {
        return { type: 'user/message', content: message.content };
      }
      return { type: 'tool/result', tool: 'restored', ok: true, content: message.content };
    });
    return session;
  }

  toJSON(): {
    version: 2;
    system: string;
    prefixHash: string;
    events: SessionEvent[];
    messages: ChatMessage[];
  } {
    return {
      version: 2,
      system: this.system,
      prefixHash: this.prefixHash(),
      events: this.events.map((event) => ({ ...event })),
      messages: this.messages.map((message) => ({ ...message })),
    };
  }
}
