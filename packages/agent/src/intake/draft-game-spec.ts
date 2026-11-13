import type { ModelProvider } from '../types.js';
import { AgentError } from '../errors.js';
import { extractJson } from './extract-json.js';
import type { GameSpecDraft } from './draft-schema.js';
import { parseGameSpecDraft } from './draft-schema.js';
import { SYSTEM_PROMPT, buildDraftPrompt, buildRepairPrompt } from './prompts.js';

export async function draftGameSpec(input: {
  prompt: string;
  provider: ModelProvider;
  maxRepairs?: number;
}): Promise<GameSpecDraft> {
  const maxRepairs = input.maxRepairs ?? 1;
  let previous = await input.provider.complete({
    system: SYSTEM_PROMPT,
    user: buildDraftPrompt(input.prompt),
    temperature: 0.2,
  });

  for (let attempt = 0; attempt <= maxRepairs; attempt += 1) {
    try {
      return parseGameSpecDraft(extractJson(previous));
    } catch (error) {
      const agentError =
        error instanceof AgentError
          ? error
          : new AgentError('INVALID_GAME_SPEC', (error as Error).message);
      if (attempt === maxRepairs) throw agentError;
      previous = await input.provider.complete({
        system: SYSTEM_PROMPT,
        user: buildRepairPrompt(previous, agentError.message),
        temperature: 0.2,
      });
    }
  }

  throw new AgentError('INVALID_GAME_SPEC', 'unreachable');
}
