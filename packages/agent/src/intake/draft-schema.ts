import { z } from 'zod';
import { gameSpecSchema } from '@gamedream/core';

export const gameSpecDraftSchema = gameSpecSchema.extend({
  genre: z
    .object({
      primary: z.string().min(1),
      secondary: z.array(z.string()).default([]),
    })
    .passthrough(),
});

export type GameSpecDraft = z.infer<typeof gameSpecDraftSchema>;

export function parseGameSpecDraft(input: unknown): GameSpecDraft {
  return gameSpecDraftSchema.parse(input);
}
