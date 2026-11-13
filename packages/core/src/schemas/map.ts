import { z } from 'zod';

export const gameMapSchema = z.object({
  id: z.string().min(1),
  tile_size: z.number().int().positive().default(32),
  tileset: z.object({
    floor: z.string().min(1),
    wall: z.string().min(1),
  }),
  rows: z.array(z.string().min(1)).min(1),
});

export type GameMap = z.infer<typeof gameMapSchema>;

export function parseGameMap(input: unknown): GameMap {
  return gameMapSchema.parse(input);
}
