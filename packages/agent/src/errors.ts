export type AgentErrorCode =
  | 'INVALID_MODEL_JSON'
  | 'INVALID_GAME_SPEC'
  | 'NO_TEMPLATES'
  | 'UNKNOWN_TEMPLATE'
  | 'MISSING_API_KEY'
  | 'PROVIDER_HTTP_ERROR'
  | 'PROVIDER_EMPTY_RESPONSE';

export class AgentError extends Error {
  constructor(
    public readonly code: AgentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AgentError';
  }
}
