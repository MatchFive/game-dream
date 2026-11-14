import { createHash } from 'node:crypto';
import type { ChatMessage } from '../types.js';

/**
 * A small DSH-inspired append-only session.
 *
 * The system prompt is kept outside the mutable transcript so a provider can
 * reuse the same byte-stable prefix across steps. Tool results are messages,
 * not concatenated into the user prompt. Compaction is explicit and only runs
 * when a character budget is exceeded.
 */
export class AgentSession {
  readonly system: string;
  messages: ChatMessage[] = [];
  private readonly initialUser: ChatMessage;

  constructor(system: string, user: string) {
    this.system = system;
    this.initialUser = { role: 'user', content: user };
    this.messages.push(this.initialUser);
  }

  appendAssistant(content: string): void {
    this.messages.push({ role: 'assistant', content });
  }

  appendTool(content: string): void {
    // The JSON action protocol has no native tool-call id, so use a user
    // message for maximum OpenAI-compatible provider support. It remains an
    // append-only message and keeps the cacheable prefix intact.
    this.messages.push({ role: 'user', content });
  }

  appendUser(content: string): void {
    this.messages.push({ role: 'user', content });
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
    this.messages = [
      this.initialUser,
      {
        role: 'user',
        content:
          '[Earlier tool history compacted to fit the context budget. Re-read files if exact content is needed.]',
      },
      ...recent,
    ];
    return true;
  }
}
