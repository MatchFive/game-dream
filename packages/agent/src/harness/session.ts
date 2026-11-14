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

export interface SessionCheckpoint {
  id: string;
  label: string;
  eventIndex: number;
  messageIndex: number;
  createdAt: string;
}

function projectMessages(events: SessionEvent[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const event of events) {
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
  checkpoints: SessionCheckpoint[] = [];
  private readonly initialUser: ChatMessage;

  constructor(system: string, user: string) {
    this.system = system;
    this.initialUser = { role: 'user', content: user };
    this.events.push({ type: 'user/message', content: user });
  }

  get messages(): ChatMessage[] {
    return projectMessages(this.events);
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

  fork(checkpointId?: string): AgentSession {
    if (checkpointId === undefined) {
      return AgentSession.restore(this.system, this.messages);
    }
    const checkpoint = this.checkpointFor(checkpointId);
    return AgentSession.restore(
      this.system,
      this.messages.slice(0, checkpoint.messageIndex),
    );
  }

  checkpoint(label = ''): SessionCheckpoint {
    const checkpoint: SessionCheckpoint = {
      id: `cp-${this.checkpoints.length + 1}`,
      label,
      eventIndex: this.events.length,
      messageIndex: this.messages.length,
      createdAt: new Date().toISOString(),
    };
    this.checkpoints.push(checkpoint);
    return checkpoint;
  }

  rewind(checkpointId: string): SessionCheckpoint {
    const checkpoint = this.checkpointFor(checkpointId);
    const eventIndex = Math.min(checkpoint.eventIndex, this.events.length);
    this.events = this.events.slice(0, eventIndex);
    this.checkpoints = this.checkpoints.slice(
      0,
      this.checkpoints.findIndex((entry) => entry.id === checkpointId) + 1,
    );
    return checkpoint;
  }

  private checkpointFor(checkpointId: string): SessionCheckpoint {
    const checkpoint = this.checkpoints.find((entry) => entry.id === checkpointId);
    if (!checkpoint) throw new Error(`unknown checkpoint: ${checkpointId}`);
    return checkpoint;
  }

  static restore(
    system: string,
    messages: ChatMessage[],
    checkpoints: SessionCheckpoint[] = [],
  ): AgentSession {
    const firstUser = messages.find((message) => message.role === 'user');
    const session = new AgentSession(system, firstUser?.content ?? '');
    session.events = messages.map((message) => {
      if (message.role === 'assistant') {
        return message.toolCalls?.length
          ? {
              type: 'assistant/tool_calls',
              content: message.content,
              calls: message.toolCalls,
            }
          : { type: 'assistant/message', content: message.content };
      }
      if (message.role === 'user') {
        return { type: 'user/message', content: message.content };
      }
      return {
        type: 'tool/result',
        tool: message.name ?? 'restored',
        ok: true,
        content: message.content,
        callId: message.toolCallId,
      };
    });
    session.checkpoints = checkpoints.map((checkpoint) => ({ ...checkpoint }));
    return session;
  }

  static fromJSON(
    system: string,
    data: {
      events?: SessionEvent[];
      messages?: ChatMessage[];
      checkpoints?: SessionCheckpoint[];
    },
  ): AgentSession {
    if (!Array.isArray(data.events)) {
      return AgentSession.restore(system, data.messages ?? [], data.checkpoints ?? []);
    }
    const firstUser = data.events.find((event) => event.type === 'user/message');
    const session = new AgentSession(
      system,
      firstUser?.type === 'user/message' ? firstUser.content : '',
    );
    session.events = data.events;
    session.checkpoints = (data.checkpoints ?? []).map((checkpoint) => ({ ...checkpoint }));
    return session;
  }

  toJSON(): {
    version: 2;
    system: string;
    prefixHash: string;
    events: SessionEvent[];
    messages: ChatMessage[];
    checkpoints: SessionCheckpoint[];
  } {
    return {
      version: 2,
      system: this.system,
      prefixHash: this.prefixHash(),
      events: this.events.map((event) => ({ ...event })),
      messages: this.messages.map((message) => ({ ...message })),
      checkpoints: this.checkpoints.map((checkpoint) => ({ ...checkpoint })),
    };
  }

  toJSONL(): string {
    return `${this.events.map((event) => JSON.stringify(event)).join('\n')}\n`;
  }

  static fromJSONL(system: string, text: string): AgentSession {
    const events = text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as SessionEvent);
    const firstUser = events.find((event) => event.type === 'user/message');
    const session = new AgentSession(
      system,
      firstUser?.type === 'user/message' ? firstUser.content : '',
    );
    session.events = events;
    return session;
  }
}
