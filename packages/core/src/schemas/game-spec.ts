import { z } from 'zod';

const engineSchema = z.enum(['godot', 'unity', 'unreal', 'web']);
const dimensionSchema = z.enum(['2d', '3d']);

export const gameSpecSchema = z
  .object({
    version: z.literal(1),
    project: z
      .object({
        name: z
          .string()
          .regex(/^[a-z0-9][a-z0-9-]*$/, 'project name must be kebab-case'),
        engine: engineSchema,
        godot_version: z.string().optional(),
        dimension: dimensionSchema,
        view: z.string().min(1),
        target: z.array(z.string().min(1)).min(1),
      })
      .passthrough(),
    genre: z
      .object({
        primary: z.string().min(1),
        secondary: z.array(z.string()).default([]),
        template: z.string().min(1),
      })
      .passthrough(),
    scope: z
      .object({
        levels: z.number().int().nonnegative().default(1),
        enemies: z.number().int().nonnegative().default(0),
        bosses: z.number().int().nonnegative().default(0),
        skills: z.number().int().nonnegative().default(0),
        items: z.number().int().nonnegative().default(0),
        quests: z.number().int().nonnegative().default(0),
      })
      .passthrough()
      .default({}),
    systems: z.record(z.boolean()).default({}),
    content: z
      .object({
        language: z.string().default('zh-CN'),
      })
      .passthrough()
      .default({}),
    vision: z.record(z.unknown()).optional(),
    acceptance: z.array(z.string()).default([]),
  })
  .passthrough();

export type GameSpec = z.infer<typeof gameSpecSchema>;

export function parseGameSpec(input: unknown): GameSpec {
  return gameSpecSchema.parse(input);
}
