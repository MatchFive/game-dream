import { z } from 'zod';
import type { VisualReview } from './types.js';

export const visualReviewSchema = z.object({
  readable: z.boolean(),
  hud_visible: z.boolean(),
  player_visible: z.boolean(),
  enemy_visible: z.boolean(),
  dialogue_readable: z.boolean(),
  issues: z.array(z.string()).default([]),
});

export function parseVisualReview(input: unknown): VisualReview {
  return visualReviewSchema.parse(input);
}
