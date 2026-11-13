import { z } from 'zod';

export const templateSchema = z
  .object({
    id: z.string().min(1),
    genre: z.string().min(1),
    dimension: z.enum(['2d', '3d']),
    view: z.string().min(1),
    modules: z.object({
      required: z.array(z.string().min(1)).min(1),
      optional: z.array(z.string().min(1)).default([]),
    }),
    minimum_complete: z.record(z.number().int().nonnegative()).default({}),
    acceptance: z.array(z.string()).default([]),
    acceptance_markers: z.array(z.string().min(1)).default(['GAMEDREAM_BOOT_OK']),
    content: z.string().optional(),
    tuning: z.string().optional(),
  })
  .passthrough();

export type TemplateManifest = z.infer<typeof templateSchema>;

export function parseTemplate(input: unknown): TemplateManifest {
  return templateSchema.parse(input);
}
