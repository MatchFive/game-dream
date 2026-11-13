export type ResolutionErrorCode =
  | 'MISSING_MODULE'
  | 'MISSING_DEPENDENCY'
  | 'CYCLE'
  | 'CONFLICT'
  | 'ENGINE_MISMATCH'
  | 'VERSION_MISMATCH';

export class ResolutionError extends Error {
  constructor(
    public readonly code: ResolutionErrorCode,
    message: string,
    public readonly details: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ResolutionError';
  }
}
