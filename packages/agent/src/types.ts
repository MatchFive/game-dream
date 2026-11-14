export interface ModelRequest {
  system: string;
  user: string;
  schema?: Record<string, unknown>;
  temperature?: number;
}

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  toolCalls?: ChatToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  temperature?: number;
  tools?: ChatToolSchema[];
  signal?: AbortSignal;
  /**
   * Stable prefix key for providers that expose an explicit prompt/KV-cache
   * boundary (for example OpenAI-compatible `prompt_cache_key`).
   */
  cacheKey?: string;
}

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
}

export interface ChatResult {
  content: string;
  toolCalls?: ChatToolCall[];
  usage?: ChatUsage;
}

export interface ModelProvider {
  readonly name: string;
  complete(request: ModelRequest): Promise<string>;
  /**
   * Optional structured chat API. Providers that can preserve an append-only
   * message prefix should implement this for better prompt/KV-cache reuse.
   */
  completeChat?(request: ChatRequest): Promise<string>;
  completeChatWithUsage?(request: ChatRequest): Promise<ChatResult>;
  completeChatStream?(
    request: ChatRequest,
    onChunk?: (chunk: string) => void,
  ): Promise<ChatResult>;
}
