import { composeProject, type ComposeOptions, type ComposeResult } from '@gamedream/core';

export async function composeCommand(options: ComposeOptions): Promise<ComposeResult> {
  return composeProject(options);
}
