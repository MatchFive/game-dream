import type {
  ChatMessage,
  ChatRequest,
  ChatResult,
  ChatToolCall,
  ChatUsage,
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
    return (
      await this.completeMessages(
        [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
        request.temperature,
      )
    ).content;
  }

  async completeChat(request: ChatRequest): Promise<string> {
    return (
      await this.completeMessages(
        request.messages,
        request.temperature,
        request.tools,
      )
    ).content;
  }

  async completeChatWithUsage(request: ChatRequest): Promise<ChatResult> {
    return this.completeMessages(
      request.messages,
      request.temperature,
      request.tools,
    );
  }

  private async completeMessages(
    messages: ChatMessage[],
    temperature?: number,
    tools?: ChatRequest['tools'],
  ): Promise<ChatResult> {
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
            messages: messages.map((message) => {
              const base: Record<string, unknown> = {
                role: message.role,
                content: message.content,
              };
              if (message.toolCalls) {
                base.tool_calls = message.toolCalls.map((call) => ({
                  id: call.id,
                  type: 'function',
                  function: { name: call.name, arguments: call.arguments },
                }));
              }
              if (message.toolCallId) base.tool_call_id = message.toolCallId;
              if (message.name) base.name = message.name;
              return base;
            }),
            temperature: temperature ?? 0.2,
            ...(tools && tools.length > 0
              ? { tools, tool_choice: 'auto' }
              : { response_format: { type: 'json_object' } }),
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

    let data: {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
        prompt_cache_hit_tokens?: number;
      };
    };
    try {
      data = (await response.json()) as typeof data;
    } catch {
      throw new AgentError('PROVIDER_HTTP_ERROR', 'provider returned invalid JSON');
    }

    const message = data.choices?.[0]?.message;
    const toolCalls: ChatToolCall[] = (message?.tool_calls ?? [])
      .filter((call) => call.function?.name)
      .map((call, index) => ({
        id: call.id ?? `call_${index}`,
        name: call.function?.name ?? '',
        arguments: call.function?.arguments ?? '{}',
      }));
    const content = message?.content ?? '';
    if (!content && toolCalls.length === 0) {
      throw new AgentError('PROVIDER_EMPTY_RESPONSE', 'provider returned no content');
    }
    const usage: ChatUsage = {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      cachedTokens:
        data.usage?.prompt_tokens_details?.cached_tokens ??
        data.usage?.prompt_cache_hit_tokens ??
        0,
    };
    return { content, toolCalls, usage };
  }
}
