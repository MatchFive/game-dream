import { z } from 'zod';

const hexColor = z
  .string()
  .regex(/^#?[0-9a-fA-F]{6}$/, 'expected a 6-digit hex color (no alpha)');

export const gameMapSchema = z.object({
  id: z.string().min(1),
  tile_size: z.number().int().min(8).max(512).default(32),
  tileset: z.object({
    floor: hexColor,
    wall: hexColor,
  }),
  rows: z.array(z.string().min(1)).min(1),
});

export type GameMap = z.infer<typeof gameMapSchema>;

export function parseGameMap(input: unknown): GameMap {
  return gameMapSchema.parse(input);
}
