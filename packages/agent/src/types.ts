export interface ModelRequest {
  system: string;
  user: string;
  schema?: Record<string, unknown>;
  temperature?: number;
}

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  temperature?: number;
}

export interface ModelProvider {
  readonly name: string;
  complete(request: ModelRequest): Promise<string>;
  /**
   * Optional structured chat API. Providers that can preserve an append-only
   * message prefix should implement this for better prompt/KV-cache reuse.
   */
  completeChat?(request: ChatRequest): Promise<string>;
}
