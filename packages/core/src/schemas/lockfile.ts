import { z } from 'zod';

export const lockfileSchema = z.object({
  version: z.literal(1),
  modules: z
    .array(
      z.object({
        id: z.string().min(1),
        version: z.string().regex(/^\d+\.\d+\.\d+$/),
        source: z.string().min(1),
        hash: z.string().min(1),
      }),
    )
    .min(1),
});

export type Lockfile = z.infer<typeof lockfileSchema>;

export function parseLockfile(input: unknown): Lockfile {
  return lockfileSchema.parse(input);
}
