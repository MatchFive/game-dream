import { z } from 'zod';

const autoloadSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  order: z.number().int().default(100),
});

export const moduleManifestSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(\.[a-z0-9_]+)+$/, 'invalid module id'),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'invalid semver'),
    engine: z.enum(['godot', 'unity', 'unreal', 'web']),
    engine_version: z.string().min(1),
    kind: z.enum(['core', 'system', 'ui', 'genre', 'assets']),
    genres: z.array(z.string()).default([]),
    depends: z.record(z.string()).default({}),
    optional_depends: z.record(z.string()).default({}),
    conflicts: z.array(z.string()).default([]),
    provides: z
      .object({
        services: z.array(z.string()).default([]),
        components: z.array(z.string()).default([]),
        events: z.array(z.string()).default([]),
      })
      .default({}),
    requires: z
      .object({
        interfaces: z.array(z.string()).default([]),
      })
      .default({}),
    config_schema: z.string().optional(),
    config_defaults: z.string().optional(),
    autoloads: z.array(autoloadSchema).default([]),
    ui_mounts: z
      .array(
        z.object({
          slot: z.string().min(1),
          scene: z.string().min(1),
          layer: z.number().int().default(0),
        }),
      )
      .default([]),
    input_actions: z
      .array(
        z.object({
          name: z.string().min(1),
          keys: z.array(z.string().min(1)).min(1),
        }),
      )
      .default([]),
    main_scene: z.string().optional(),
    save_sections: z
      .array(z.object({ key: z.string().min(1), serializer: z.string().min(1) }))
      .default([]),
    hooks: z.array(z.string()).default([]),
    scenarios: z.array(z.string()).default([]),
    tests: z.array(z.string()).default([]),
    ai_skill: z.string().optional(),
    docs: z.string().optional(),
    license: z.string().default('Apache-2.0'),
    authors: z.array(z.string()).default([]),
  })
  .passthrough();

export type ModuleManifest = z.infer<typeof moduleManifestSchema>;

export function parseModuleManifest(input: unknown): ModuleManifest {
  return moduleManifestSchema.parse(input);
}
