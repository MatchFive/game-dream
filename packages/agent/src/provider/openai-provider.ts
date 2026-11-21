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
  readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAICompatibleOptions) {
    this.model = options.model;
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
        request.signal,
        request.cacheKey,
      )
    ).content;
  }

  async completeChatWithUsage(request: ChatRequest): Promise<ChatResult> {
    return this.completeMessages(
      request.messages,
      request.temperature,
      request.tools,
      request.signal,
      request.cacheKey,
    );
  }

  async completeChatStream(
    request: ChatRequest,
    onChunk?: (chunk: string) => void,
  ): Promise<ChatResult> {
    const timeoutMs = this.options.timeoutMs ?? 120_000;
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = request.signal
      ? AbortSignal.any([request.signal, timeout])
      : timeout;
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
            messages: this.serializeMessages(request.messages),
            temperature: request.temperature ?? 0.2,
            ...(request.cacheKey ? { prompt_cache_key: request.cacheKey } : {}),
            ...(request.tools && request.tools.length > 0
              ? { tools: request.tools, tool_choice: 'auto' }
              : { response_format: { type: 'json_object' } }),
            stream: true,
            stream_options: { include_usage: true },
          }),
          signal,
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

    const reader = response.body?.getReader();
    if (!reader) throw new AgentError('PROVIDER_HTTP_ERROR', 'provider returned no stream');
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let usage: ChatUsage = { promptTokens: 0, completionTokens: 0, cachedTokens: 0 };
    const callMap = new Map<number, ChatToolCall>();

    const consume = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) return;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') return;
      let chunk: {
        choices?: Array<{
          delta?: {
            content?: string;
            tool_calls?: Array<{
              index?: number;
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
        chunk = JSON.parse(payload) as typeof chunk;
      } catch {
        return;
      }
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) {
        content += delta.content;
        onChunk?.(delta.content);
      }
      for (const call of delta?.tool_calls ?? []) {
        // OpenAI-compatible streams split one call across chunks: the first
        // chunk carries id/name, later chunks only index + arguments.
        const index = call.index ?? 0;
        const current = callMap.get(index) ?? { id: '', name: '', arguments: '' };
        if (call.id) current.id = call.id;
        if (call.function?.name) current.name += call.function.name;
        if (call.function?.arguments) current.arguments += call.function.arguments;
        callMap.set(index, current);
      }
      if (chunk.usage) {
        usage = {
          promptTokens: chunk.usage.prompt_tokens ?? usage.promptTokens,
          completionTokens: chunk.usage.completion_tokens ?? usage.completionTokens,
          cachedTokens:
            chunk.usage.prompt_tokens_details?.cached_tokens ??
            chunk.usage.prompt_cache_hit_tokens ??
            usage.cachedTokens,
        };
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        consume(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
      }
    }
    if (buffer) consume(buffer);
    const toolCalls = [...callMap.entries()]
      .sort(([left], [right]) => left - right)
      .map(([index, call]) => ({
        ...call,
        id: call.id || `call_${index}`,
      }))
      .filter((call) => call.name);
    if (!content && toolCalls.length === 0) {
      throw new AgentError('PROVIDER_EMPTY_RESPONSE', 'provider returned no content');
    }
    return { content, toolCalls, usage };
  }

  private serializeMessages(messages: ChatMessage[]): Record<string, unknown>[] {
    return messages.map((message) => {
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
    });
  }

  private async completeMessages(
    messages: ChatMessage[],
    temperature?: number,
    tools?: ChatRequest['tools'],
    externalSignal?: AbortSignal,
    cacheKey?: string,
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
            messages: this.serializeMessages(messages),
            temperature: temperature ?? 0.2,
            ...(cacheKey ? { prompt_cache_key: cacheKey } : {}),
            ...(tools && tools.length > 0
              ? { tools, tool_choice: 'auto' }
              : { response_format: { type: 'json_object' } }),
            stream: false,
          }),
          signal: externalSignal
            ? AbortSignal.any([externalSignal, AbortSignal.timeout(timeoutMs)])
            : AbortSignal.timeout(timeoutMs),
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
