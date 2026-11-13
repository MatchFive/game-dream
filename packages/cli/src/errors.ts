import { ResolutionError } from '@gamedream/core';

export interface CliError {
  message: string;
  exitCode: 1 | 2 | 3;
}

export function formatCliError(error: unknown): CliError {
  if (error instanceof ResolutionError) {
    const details = Object.keys(error.details).length
      ? ` ${JSON.stringify(error.details)}`
      : '';
    return {
      message: `${error.code}: ${error.message}${details}`,
      exitCode: 2,
    };
  }
  return {
    message: `ERROR: ${error instanceof Error ? error.message : String(error)}`,
    exitCode: 1,
  };
}
