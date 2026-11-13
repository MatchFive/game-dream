export interface ModelRequest {
  system: string;
  user: string;
  schema?: Record<string, unknown>;
  temperature?: number;
}

export interface ModelProvider {
  readonly name: string;
  complete(request: ModelRequest): Promise<string>;
}
