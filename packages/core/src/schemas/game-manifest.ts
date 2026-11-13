import { z } from 'zod';

export const gameManifestSchema = z.object({
  version: z.literal(1),
  managed: z.array(z.string().min(1)).min(1),
  user: z.array(z.string().min(1)),
  hashes: z.record(z.string()),
  acceptance: z
    .object({
      markers: z.array(z.string().min(1)).min(1),
    })
    .default({ markers: ['GAMEDREAM_BOOT_OK'] }),
});

export type GameManifest = z.infer<typeof gameManifestSchema>;

export function parseGameManifest(input: unknown): GameManifest {
  return gameManifestSchema.parse(input);
}
