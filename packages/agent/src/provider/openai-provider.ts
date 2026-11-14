import type {
  ChatMessage,
  ChatRequest,
  ModelProvider,
  ModelRequest,
} from '../types.js';
import { AgentError } from '../errors.js';

export interface OpenAICompatibleOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class OpenAICompatibleProvider implements ModelProvider {
  readonly name = 'openai';
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAICompatibleOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async complete(request: ModelRequest): Promise<string> {
    return this.completeMessages(
      [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
      request.temperature,
    );
  }

  async completeChat(request: ChatRequest): Promise<string> {
    return this.completeMessages(request.messages, request.temperature);
  }

  private async completeMessages(
    messages: ChatMessage[],
    temperature?: number,
  ): Promise<string> {
    const timeoutMs = this.options.timeoutMs ?? 120_000;
    let response: Response;

    try {
      response = await this.fetchImpl(
        `${this.options.baseUrl.replace(/\/$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.options.apiKey}`,
          },
          body: JSON.stringify({
            model: this.options.model,
            messages,
            temperature: temperature ?? 0.2,
            response_format: { type: 'json_object' },
            stream: false,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
    } catch (error) {
      const caught = error as Error;
      const timedOut = caught.name === 'TimeoutError' || caught.name === 'AbortError';
      throw new AgentError(
        'PROVIDER_HTTP_ERROR',
        timedOut
          ? `provider timed out after ${timeoutMs}ms`
          : `provider request failed: ${caught.message}`,
      );
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => ''))
        .replace(/\s+/g, ' ')
        .slice(0, 500);
      throw new AgentError(
        'PROVIDER_HTTP_ERROR',
        `provider returned ${response.status}${detail ? `: ${detail}` : ''}`,
      );
    }

    let data: { choices?: Array<{ message?: { content?: string } }> };
    try {
      data = (await response.json()) as typeof data;
    } catch {
      throw new AgentError('PROVIDER_HTTP_ERROR', 'provider returned invalid JSON');
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new AgentError('PROVIDER_EMPTY_RESPONSE', 'provider returned no content');
    }
    return content;
  }
}
