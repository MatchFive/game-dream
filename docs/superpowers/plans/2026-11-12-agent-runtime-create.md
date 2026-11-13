# GameDream Agent Runtime + `dream create` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a natural-language game prompt into a validated `gamedream.yaml`, select a genre template, and generate a bootable Godot project through the existing composer — offline-testable with a deterministic fake provider, real use through an OpenAI-compatible provider.

**Architecture:** New `@gamedream/agent` package: model-provider port, deterministic fake, prompt→GameSpec drafter with one repair pass, rule-based template selector, and a `createProject` orchestrator that writes the spec then calls the existing `composeProject`. CLI gains `dream create` with `auto` / `dry-run` modes. No gameplay modules in this plan; the generated project is the current `fixture-minimal` slice. Player/AI/combat/gameflow modules are Plan 3.

**Tech Stack:** Existing TypeScript/pnpm/Vitest/Zod/YAML stack; Node 22 global `fetch`; no new runtime dependency beyond `@gamedream/core` and `yaml`.

**Spec:** `docs/superpowers/specs/2026-11-12-gamedream-design.md`

## Global Constraints

- Node.js **>= 22**; TypeScript **strict**, ESM.
- No network in tests. Every test uses `FakeProvider` or an injected `fetch`.
- `dream create --mode dry-run` writes **nothing** — not even `gamedream.yaml`.
- `dream create` in `auto` mode writes `gamedream.yaml` into the output directory, then calls `composeProject`.
- Model output is untrusted: extract JSON, validate with Zod, repair once, then fail with a stable `AgentError` code.
- Never log `OPENAI_API_KEY` or the full request headers.
- Template selection must only return templates that actually exist; otherwise fall back deterministically and report why.
- Reuse Plan 1's composer boundaries: `modules/` and `game/_generated/` managed; `game/` user-owned.
- Provider selection:
  - `--provider auto` → OpenAI-compatible when `OPENAI_API_KEY` is set, otherwise `fake` with a printed notice.
  - `--provider openai` → requires `OPENAI_API_KEY`; `OPENAI_BASE_URL` defaults to `https://api.openai.com/v1`; `GAMEDREAM_MODEL` defaults to `gpt-4o-mini`.
- Exit codes: `0` success, `1` usage/IO, `2` generation/validation/verify failure, `3` environment missing (Godot or API key).
- No gameplay modules, no asset generation, no MCP addon in this plan.

## Review Focus

1. **Invalid or partial model JSON** — must repair once with the validation error, then fail with `INVALID_MODEL_JSON` / `INVALID_GAME_SPEC`; never write an invalid spec. Owning tasks: Task 2, Task 4.
2. **Provider misconfiguration / network failure** — missing API key exits `3`; HTTP error exits `2`; no hang, no key leak. Owning tasks: Task 5, Task 6.
3. **Template selection picks a nonexistent template** — must fall back to an existing template and report the fallback. Owning task: Task 3.
4. **`dry-run` writes nothing** — no `gamedream.yaml`, no `project.godot`, no `modules/`. Owning task: Task 4, Task 6.
5. **Duplicate `create` overwrites user work** — a second create into an existing project preserves `game/content/` and user edits. Owning task: Task 4, Task 7.

---

## File Structure

```
packages/
  agent/
    package.json
    tsconfig.json
    src/
      index.ts
      errors.ts
      types.ts
      provider/
        provider.ts
        fake-provider.ts
        openai-provider.ts
        create-provider.ts
      intake/
        draft-schema.ts
        prompts.ts
        extract-json.ts
        draft-game-spec.ts
      classify/
        select-template.ts
      create/
        create-project.ts
        types.ts
    test/
      fake-provider.test.ts
      draft-game-spec.test.ts
      select-template.test.ts
      create-project.test.ts
      openai-provider.test.ts
  cli/
    src/
      commands/
        create.ts
      program.ts
    test/
      create.test.ts
      create-e2e.test.ts
```

---

### Task 1: Agent package scaffold, provider port, fake provider

**Files:**
- Create: `packages/agent/package.json`
- Create: `packages/agent/tsconfig.json`
- Create: `packages/agent/src/index.ts`
- Create: `packages/agent/src/types.ts`
- Create: `packages/agent/src/errors.ts`
- Create: `packages/agent/src/provider/provider.ts`
- Create: `packages/agent/src/provider/fake-provider.ts`
- Test: `packages/agent/test/fake-provider.test.ts`
- Modify: `vitest.config.ts` (add `@gamedream/agent` alias)
- Modify: `packages/cli/package.json` (add `@gamedream/agent` workspace dep)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ModelProvider { readonly name: string; complete(request: ModelRequest): Promise<string> }`
  - `ModelRequest { system: string; user: string; schema?: Record<string, unknown>; temperature?: number }`
  - `FakeProvider` with `name = 'fake'` and deterministic JSON based on the prompt.
  - `AgentError` with codes `INVALID_MODEL_JSON | INVALID_GAME_SPEC | NO_TEMPLATES | UNKNOWN_TEMPLATE | MISSING_API_KEY | PROVIDER_HTTP_ERROR | PROVIDER_EMPTY_RESPONSE`.

- [ ] **Step 1: Create the package scaffold**

`packages/agent/package.json`:

```json
{
  "name": "@gamedream/agent",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc -b --pretty false"
  },
  "dependencies": {
    "@gamedream/core": "workspace:*",
    "yaml": "^2.6.1",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@gamedream/testing": "workspace:*"
  }
}
```

`packages/agent/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

Modify `vitest.config.ts` aliases:

```ts
'@gamedream/agent': fileURLToPath(
  new URL('./packages/agent/src/index.ts', import.meta.url),
),
```

Modify `packages/cli/package.json` dependencies:

```json
"@gamedream/agent": "workspace:*"
```

Then:

```bash
corepack pnpm install
```

- [ ] **Step 2: Write the failing test**

`packages/agent/test/fake-provider.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FakeProvider } from '../src/provider/fake-provider.js';

describe('FakeProvider', () => {
  it('returns a deterministic draft with a slugged project name', async () => {
    const provider = new FakeProvider();
    const first = await provider.complete({
      system: 'system',
      user: '做一个俯视角动作 RPG，有背包和 1 个敌人',
    });
    const second = await provider.complete({
      system: 'system',
      user: '做一个俯视角动作 RPG，有背包和 1 个敌人',
    });
    expect(first).toBe(second);
    const draft = JSON.parse(first);
    expect(draft.version).toBe(1);
    expect(draft.project.engine).toBe('godot');
    expect(draft.project.name).toMatch(/^[a-z0-9-]+$/);
    expect(draft.genre.primary).toBe('action-rpg');
  });

  it('returns queued responses when configured', async () => {
    const provider = new FakeProvider({ responses: ['first', 'second'] });
    expect(await provider.complete({ system: 's', user: 'u' })).toBe('first');
    expect(await provider.complete({ system: 's', user: 'u' })).toBe('second');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
corepack pnpm vitest run packages/agent/test/fake-provider.test.ts
```

Expected: FAIL because the package/provider does not exist.

- [ ] **Step 4: Implement the provider port and fake**

`packages/agent/src/types.ts`:

```ts
export interface ModelRequest {
  system: string;
  user: string;
  schema?: Record<string, unknown>;
  temperature?: number;
}

export interface ModelProvider {
  readonly name: string;
  complete(request: ModelRequest): Promise<string>;
}
```

`packages/agent/src/errors.ts`:

```ts
export type AgentErrorCode =
  | 'INVALID_MODEL_JSON'
  | 'INVALID_GAME_SPEC'
  | 'NO_TEMPLATES'
  | 'UNKNOWN_TEMPLATE'
  | 'MISSING_API_KEY'
  | 'PROVIDER_HTTP_ERROR'
  | 'PROVIDER_EMPTY_RESPONSE';

export class AgentError extends Error {
  constructor(
    public readonly code: AgentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AgentError';
  }
}
```

`packages/agent/src/provider/provider.ts`:

```ts
export type { ModelProvider, ModelRequest } from '../types.js';
```

`packages/agent/src/provider/fake-provider.ts`:

```ts
import type { ModelProvider, ModelRequest } from '../types.js';

export interface FakeProviderOptions {
  responses?: string[];
}

function slugify(input: string): string {
  const ascii = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return ascii || 'gamedream-demo';
}

function inferGenre(prompt: string): string {
  if (/roguelike|rogue|随机|永久死亡/i.test(prompt)) return 'roguelike';
  if (/platformer|平台|跳跃/i.test(prompt)) return 'platformer';
  if (/塔防|tower defense/i.test(prompt)) return 'tower-defense';
  if (/射击|shooter/i.test(prompt)) return 'shooter';
  return 'action-rpg';
}

export class FakeProvider implements ModelProvider {
  readonly name = 'fake';
  private readonly responses: string[];

  constructor(options: FakeProviderOptions = {}) {
    this.responses = [...(options.responses ?? [])];
  }

  async complete(request: ModelRequest): Promise<string> {
    const queued = this.responses.shift();
    if (queued !== undefined) return queued;
    const prompt = request.user;
    return JSON.stringify({
      version: 1,
      project: {
        name: slugify(prompt),
        engine: 'godot',
        godot_version: '4.4',
        dimension: '2d',
        view: 'top-down',
        target: ['windows'],
      },
      genre: {
        primary: inferGenre(prompt),
        secondary: [],
      },
      vision: {
        fantasy: prompt,
        pillars: ['快速验证核心循环'],
        references: [],
      },
      scope: {
        levels: 1,
        enemies: 1,
        bosses: 0,
        skills: 0,
        items: 3,
        quests: 0,
      },
      systems: {
        inventory: true,
        save: true,
      },
      content: {
        language: 'zh-CN',
      },
      acceptance: ['项目可启动', 'HUD 显示 Inventory: 1'],
    });
  }
}
```

`packages/agent/src/index.ts`:

```ts
export * from './types.js';
export * from './errors.js';
export * from './provider/provider.js';
export * from './provider/fake-provider.js';
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
corepack pnpm vitest run packages/agent/test/fake-provider.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/agent packages/cli/package.json vitest.config.ts pnpm-lock.yaml
git commit -m "feat(agent): add provider port and fake provider"
```

---

### Task 2: GameSpec draft schema, prompts, JSON extraction, drafter with repair

**Files:**
- Create: `packages/agent/src/intake/draft-schema.ts`
- Create: `packages/agent/src/intake/prompts.ts`
- Create: `packages/agent/src/intake/extract-json.ts`
- Create: `packages/agent/src/intake/draft-game-spec.ts`
- Modify: `packages/agent/src/index.ts`
- Test: `packages/agent/test/draft-game-spec.test.ts`

**Interfaces:**
- Consumes: `ModelProvider`, `AgentError`, `gameSpecSchema` from core.
- Produces:
  - `GameSpecDraft` (GameSpec without `genre.template`; `genre` has `primary`, `secondary`)
  - `parseGameSpecDraft(input: unknown): GameSpecDraft`
  - `extractJson(text: string): unknown`
  - `draftGameSpec(input: { prompt: string; provider: ModelProvider; maxRepairs?: number }): Promise<GameSpecDraft>`

- [ ] **Step 1: Write the failing tests**

`packages/agent/test/draft-game-spec.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FakeProvider } from '../src/provider/fake-provider.js';
import { draftGameSpec } from '../src/intake/draft-game-spec.js';
import { AgentError } from '../src/errors.js';
import { extractJson } from '../src/intake/extract-json.js';

const validDraft = {
  version: 1,
  project: {
    name: 'my-game',
    engine: 'godot',
    godot_version: '4.4',
    dimension: '2d',
    view: 'top-down',
    target: ['windows'],
  },
  genre: { primary: 'action-rpg', secondary: [] },
  vision: { fantasy: 'test', pillars: [], references: [] },
  scope: { levels: 1, enemies: 1, bosses: 0, skills: 0, items: 3, quests: 0 },
  systems: { inventory: true, save: true },
  content: { language: 'zh-CN' },
  acceptance: ['项目可启动'],
};

describe('extractJson', () => {
  it('extracts JSON from markdown fences', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('rejects text with no JSON object', () => {
    expect(() => extractJson('no json here')).toThrowError(AgentError);
  });
});

describe('draftGameSpec', () => {
  it('returns a validated draft from a fake provider', async () => {
    const draft = await draftGameSpec({
      prompt: '做一个俯视角动作 RPG',
      provider: new FakeProvider(),
    });
    expect(draft.project.engine).toBe('godot');
    expect(draft.genre.primary).toBe('action-rpg');
  });

  it('repairs once when the first response is invalid JSON', async () => {
    const provider = new FakeProvider({
      responses: ['not json', JSON.stringify(validDraft)],
    });
    const draft = await draftGameSpec({ prompt: 'x', provider });
    expect(draft.project.name).toBe('my-game');
  });

  it('fails after one failed repair', async () => {
    const provider = new FakeProvider({ responses: ['not json', 'still not json'] });
    await expect(draftGameSpec({ prompt: 'x', provider })).rejects.toMatchObject({
      code: 'INVALID_MODEL_JSON',
    });
  });

  it('rejects a draft that fails the GameSpec schema', async () => {
    const provider = new FakeProvider({
      responses: [JSON.stringify({ ...validDraft, project: { ...validDraft.project, engine: 'cryengine' } })],
    });
    await expect(draftGameSpec({ prompt: 'x', provider })).rejects.toMatchObject({
      code: 'INVALID_GAME_SPEC',
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
corepack pnpm vitest run packages/agent/test/draft-game-spec.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement the draft pipeline**

`packages/agent/src/intake/draft-schema.ts`:

```ts
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
```

`packages/agent/src/intake/prompts.ts`:

```ts
export const SYSTEM_PROMPT = `You are GameDream's intake planner for 2D Godot games.
Return one JSON object only. No markdown fences, no commentary.
The JSON must match this shape:
{
  "version": 1,
  "project": { "name": "kebab-case", "engine": "godot", "godot_version": "4.4", "dimension": "2d", "view": "top-down", "target": ["windows"] },
  "genre": { "primary": "action-rpg", "secondary": [] },
  "vision": { "fantasy": "one sentence", "pillars": ["..."], "references": [] },
  "scope": { "levels": 1, "enemies": 1, "bosses": 0, "skills": 0, "items": 3, "quests": 0 },
  "systems": { "inventory": true, "save": true },
  "content": { "language": "zh-CN" },
  "acceptance": ["项目可启动"]
}
Keep scope small: one level, at most one enemy, no boss unless asked.`;

export function buildDraftPrompt(prompt: string): string {
  return `Game idea:\n${prompt}\n\nReturn the JSON object now.`;
}

export function buildRepairPrompt(previous: string, error: string): string {
  return `Your previous response was invalid.\nError: ${error}\nPrevious response:\n${previous}\n\nReturn a corrected JSON object only.`;
}
```

`packages/agent/src/intake/extract-json.ts`:

```ts
import { AgentError } from '../errors.js';

export function extractJson(text: string): unknown {
  const withoutFences = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = withoutFences.indexOf('{');
  const end = withoutFences.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new AgentError('INVALID_MODEL_JSON', 'model response contains no JSON object');
  }
  try {
    return JSON.parse(withoutFences.slice(start, end + 1));
  } catch (error) {
    throw new AgentError(
      'INVALID_MODEL_JSON',
      `model response is not valid JSON: ${(error as Error).message}`,
    );
  }
}
```

`packages/agent/src/intake/draft-game-spec.ts`:

```ts
import type { ModelProvider } from '../types.js';
import { AgentError } from '../errors.js';
import { extractJson } from './extract-json.js';
import { parseGameSpecDraft } from './draft-schema.js';
import { SYSTEM_PROMPT, buildDraftPrompt, buildRepairPrompt } from './prompts.js';

export async function draftGameSpec(input: {
  prompt: string;
  provider: ModelProvider;
  maxRepairs?: number;
}): Promise<ReturnType<typeof parseGameSpecDraft>> {
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
      const agentError = error instanceof AgentError
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
```

Modify `packages/agent/src/index.ts` to export the new modules.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
corepack pnpm vitest run packages/agent/test/draft-game-spec.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent
git commit -m "feat(agent): draft GameSpec with one repair pass"
```

---

### Task 3: Rule-based template selector

**Files:**
- Create: `packages/agent/src/classify/select-template.ts`
- Modify: `packages/agent/src/index.ts`
- Test: `packages/agent/test/select-template.test.ts`

**Interfaces:**
- Consumes: `templatesDir` filesystem.
- Produces:
  - `TemplateSelection { templateId: string; reason: string }`
  - `selectTemplate(input: { prompt: string; genre: string; templatesDir: string }): TemplateSelection`

- [ ] **Step 1: Write the failing test**

`packages/agent/test/select-template.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { selectTemplate } from '../src/classify/select-template.js';
import { AgentError } from '../src/errors.js';

function makeTemplates(ids: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'gamedream templates '));
  for (const id of ids) {
    mkdirSync(join(root, id), { recursive: true });
    writeFileSync(
      join(root, id, 'template.yaml'),
      `id: ${id}\ngenre: action-rpg\ndimension: 2d\nview: top-down\nmodules:\n  required: [core.events]\n`,
      'utf8',
    );
  }
  return root;
}

describe('selectTemplate', () => {
  it('uses the fixture template for a generic action RPG prompt', () => {
    const templatesDir = makeTemplates(['fixture-minimal', 'roguelike-topdown']);
    const selection = selectTemplate({
      prompt: '做一个俯视角动作 RPG，有背包',
      genre: 'action-rpg',
      templatesDir,
    });
    expect(selection.templateId).toBe('fixture-minimal');
  });

  it('prefers a roguelike template when it exists', () => {
    const templatesDir = makeTemplates(['fixture-minimal', 'roguelike-topdown']);
    const selection = selectTemplate({
      prompt: '做一个 roguelike，随机地牢',
      genre: 'roguelike',
      templatesDir,
    });
    expect(selection.templateId).toBe('roguelike-topdown');
  });

  it('falls back when the preferred template is missing', () => {
    const templatesDir = makeTemplates(['fixture-minimal']);
    const selection = selectTemplate({
      prompt: '做一个 roguelike，随机地牢',
      genre: 'roguelike',
      templatesDir,
    });
    expect(selection.templateId).toBe('fixture-minimal');
    expect(selection.reason).toContain('fallback');
  });

  it('fails when no templates exist', () => {
    const templatesDir = makeTemplates([]);
    expect(() =>
      selectTemplate({ prompt: 'x', genre: 'action-rpg', templatesDir }),
    ).toThrowError(AgentError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
corepack pnpm vitest run packages/agent/test/select-template.test.ts
```

Expected: FAIL because the selector does not exist.

- [ ] **Step 3: Implement the selector**

`packages/agent/src/classify/select-template.ts`:

```ts
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AgentError } from '../errors.js';

export interface TemplateSelection {
  templateId: string;
  reason: string;
}

interface Rule {
  pattern: RegExp;
  templateId: string;
}

const RULES: Rule[] = [
  { pattern: /roguelike|rogue|随机|永久死亡/i, templateId: 'roguelike-topdown' },
  { pattern: /platformer|平台|跳跃/i, templateId: 'platformer-2d' },
  { pattern: /塔防|tower defense/i, templateId: 'tower-defense' },
  { pattern: /射击|shooter/i, templateId: 'shooter-topdown' },
  { pattern: /rpg|角色扮演|背包|装备|技能|boss/i, templateId: 'fixture-minimal' },
];

export function selectTemplate(input: {
  prompt: string;
  genre: string;
  templatesDir: string;
}): TemplateSelection {
  const available = existsSync(input.templatesDir)
    ? readdirSync(input.templatesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((id) => existsSync(join(input.templatesDir, id, 'template.yaml')))
    : [];

  if (available.length === 0) {
    throw new AgentError('NO_TEMPLATES', `no templates found in ${input.templatesDir}`);
  }

  const haystack = `${input.prompt} ${input.genre}`;
  const matched = RULES.find((rule) => rule.pattern.test(haystack));
  if (matched && available.includes(matched.templateId)) {
    return { templateId: matched.templateId, reason: `rule:${matched.templateId}` };
  }

  const fallback = available.includes('fixture-minimal') ? 'fixture-minimal' : available[0];
  return {
    templateId: fallback,
    reason: matched
      ? `fallback:${matched.templateId}->${fallback}`
      : `fallback:default->${fallback}`,
  };
}
```

Modify `packages/agent/src/index.ts` to export the selector.

- [ ] **Step 4: Run the test to verify it passes**

```bash
corepack pnpm vitest run packages/agent/test/select-template.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/agent
git commit -m "feat(agent): select genre template with deterministic fallback"
```

---

### Task 4: Create orchestrator (auto / dry-run)

**Files:**
- Create: `packages/agent/src/create/types.ts`
- Create: `packages/agent/src/create/create-project.ts`
- Modify: `packages/agent/src/index.ts`
- Test: `packages/agent/test/create-project.test.ts`

**Interfaces:**
- Consumes: `draftGameSpec`, `selectTemplate`, `composeProject`, `LocalRegistry`, `resolveModules`, `loadTemplate`, `parseGameSpec`.
- Produces:
  - `CreateMode = 'auto' | 'dry-run'`
  - `CreateOptions { prompt; outDir; modulesDir; templatesDir; provider; mode }`
  - `CreateResult { spec: GameSpec; templateId: string; reason: string; outDir: string; provider: string; compose?: ComposeResult; plannedModules?: string[] }`
  - `createProject(options: CreateOptions): Promise<CreateResult>`

- [ ] **Step 1: Write the failing test**

`packages/agent/test/create-project.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import { createProject } from '../src/create/create-project.js';
import { FakeProvider } from '../src/provider/fake-provider.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

function options(outDir = join(makeTempDir('gamedream create '), 'my game')) {
  return {
    prompt: '做一个俯视角动作 RPG，有背包和 1 个敌人',
    outDir,
    modulesDir: join(root, 'modules'),
    templatesDir: join(root, 'templates'),
    provider: new FakeProvider(),
    mode: 'auto' as const,
  };
}

describe('createProject', () => {
  it('writes gamedream.yaml and composes the fixture project', async () => {
    const opts = options();
    const result = await createProject(opts);
    expect(result.templateId).toBe('fixture-minimal');
    expect(result.provider).toBe('fake');
    expect(existsSync(join(opts.outDir, 'gamedream.yaml'))).toBe(true);
    expect(existsSync(join(opts.outDir, 'project.godot'))).toBe(true);
    expect(existsSync(join(opts.outDir, 'modules.lock.json'))).toBe(true);
    const spec = readFileSync(join(opts.outDir, 'gamedream.yaml'), 'utf8');
    expect(spec).toContain('template: fixture-minimal');
  });

  it('writes nothing in dry-run mode', async () => {
    const opts = { ...options(), mode: 'dry-run' as const };
    const result = await createProject(opts);
    expect(result.plannedModules).toContain('core.events');
    expect(existsSync(join(opts.outDir, 'gamedream.yaml'))).toBe(false);
    expect(existsSync(join(opts.outDir, 'project.godot'))).toBe(false);
  });

  it('preserves user files on a second create', async () => {
    const opts = options();
    await createProject(opts);
    const userFile = join(opts.outDir, 'game/content/items/keep.json');
    mkdirSync(join(opts.outDir, 'game/content/items'), { recursive: true });
    writeFileSync(userFile, '{"id":"keep"}\n', 'utf8');
    await createProject(opts);
    expect(readFileSync(userFile, 'utf8')).toBe('{"id":"keep"}\n');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
corepack pnpm vitest run packages/agent/test/create-project.test.ts
```

Expected: FAIL because `createProject` does not exist.

- [ ] **Step 3: Implement the orchestrator**

`packages/agent/src/create/types.ts`:

```ts
import type { ComposeResult, GameSpec } from '@gamedream/core';
import type { ModelProvider } from '../types.js';

export type CreateMode = 'auto' | 'dry-run';

export interface CreateOptions {
  prompt: string;
  outDir: string;
  modulesDir: string;
  templatesDir: string;
  provider: ModelProvider;
  mode: CreateMode;
}

export interface CreateResult {
  spec: GameSpec;
  templateId: string;
  reason: string;
  outDir: string;
  provider: string;
  compose?: ComposeResult;
  plannedModules?: string[];
}
```

`packages/agent/src/create/create-project.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import {
  LocalRegistry,
  composeProject,
  loadTemplate,
  parseGameSpec,
  resolveModules,
} from '@gamedream/core';
import { draftGameSpec } from '../intake/draft-game-spec.js';
import { selectTemplate } from '../classify/select-template.js';
import type { CreateOptions, CreateResult } from './types.js';

export async function createProject(options: CreateOptions): Promise<CreateResult> {
  const draft = await draftGameSpec({ prompt: options.prompt, provider: options.provider });
  const selection = selectTemplate({
    prompt: options.prompt,
    genre: draft.genre.primary,
    templatesDir: options.templatesDir,
  });
  const spec = parseGameSpec({
    ...draft,
    genre: { ...draft.genre, template: selection.templateId },
  });

  if (options.mode === 'dry-run') {
    const registry = new LocalRegistry(options.modulesDir);
    const template = loadTemplate(
      join(options.templatesDir, selection.templateId, 'template.yaml'),
    );
    const resolution = resolveModules({
      spec,
      template,
      registry,
      engine: spec.project.engine,
      engineVersion: spec.project.godot_version,
    });
    return {
      spec,
      templateId: selection.templateId,
      reason: selection.reason,
      outDir: options.outDir,
      provider: options.provider.name,
      plannedModules: resolution.order,
    };
  }

  mkdirSync(options.outDir, { recursive: true });
  const specPath = join(options.outDir, 'gamedream.yaml');
  writeFileSync(specPath, stringify(spec), 'utf8');

  const compose = await composeProject({
    specPath,
    outDir: options.outDir,
    modulesDir: options.modulesDir,
    templatesDir: options.templatesDir,
  });

  return {
    spec,
    templateId: selection.templateId,
    reason: selection.reason,
    outDir: options.outDir,
    provider: options.provider.name,
    compose,
  };
}
```

Modify `packages/agent/src/index.ts` to export create modules.

- [ ] **Step 4: Run the test to verify it passes**

```bash
corepack pnpm vitest run packages/agent/test/create-project.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/agent
git commit -m "feat(agent): orchestrate prompt to composed project"
```

---

### Task 5: OpenAI-compatible provider and provider factory

**Files:**
- Create: `packages/agent/src/provider/openai-provider.ts`
- Create: `packages/agent/src/provider/create-provider.ts`
- Modify: `packages/agent/src/index.ts`
- Test: `packages/agent/test/openai-provider.test.ts`

**Interfaces:**
- Consumes: `ModelProvider`, `AgentError`.
- Produces:
  - `OpenAICompatibleProvider` constructor `{ apiKey, baseUrl, model, fetchImpl? }`
  - `createProvider({ kind, env?, fetchImpl? }): ModelProvider`
  - `ProviderKind = 'auto' | 'fake' | 'openai'`

- [ ] **Step 1: Write the failing test**

`packages/agent/test/openai-provider.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { OpenAICompatibleProvider } from '../src/provider/openai-provider.js';
import { createProvider } from '../src/provider/create-provider.js';

const okResponse = {
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
};

describe('OpenAICompatibleProvider', () => {
  it('posts to chat/completions and returns message content', async () => {
    const fetchImpl = vi.fn(async () => okResponse as Response);
    const provider = new OpenAICompatibleProvider({
      apiKey: 'test-key',
      baseUrl: 'https://example.test/v1',
      model: 'test-model',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const text = await provider.complete({ system: 's', user: 'u', temperature: 0.1 });
    expect(text).toBe('{"ok":true}');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      }),
    );
    const body = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe('test-model');
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('throws a provider error on HTTP failure', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    })) as unknown as typeof fetch;
    const provider = new OpenAICompatibleProvider({
      apiKey: 'bad',
      baseUrl: 'https://example.test/v1',
      model: 'test-model',
      fetchImpl,
    });
    await expect(provider.complete({ system: 's', user: 'u' })).rejects.toMatchObject({
      code: 'PROVIDER_HTTP_ERROR',
    });
  });

  it('throws when the response has no content', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [] }),
    })) as unknown as typeof fetch;
    const provider = new OpenAICompatibleProvider({
      apiKey: 'k',
      baseUrl: 'https://example.test/v1',
      model: 'm',
      fetchImpl,
    });
    await expect(provider.complete({ system: 's', user: 'u' })).rejects.toMatchObject({
      code: 'PROVIDER_EMPTY_RESPONSE',
    });
  });
});

describe('createProvider', () => {
  it('uses fake when auto has no API key', () => {
    expect(createProvider({ kind: 'auto', env: {} }).name).toBe('fake');
  });

  it('uses openai when auto has an API key', () => {
    expect(
      createProvider({
        kind: 'auto',
        env: { OPENAI_API_KEY: 'k', GAMEDREAM_MODEL: 'm' },
      }).name,
    ).toBe('openai');
  });

  it('fails openai without an API key', () => {
    try {
      createProvider({ kind: 'openai', env: {} });
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toMatchObject({ code: 'MISSING_API_KEY' });
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
corepack pnpm vitest run packages/agent/test/openai-provider.test.ts
```

Expected: FAIL because the provider does not exist.

- [ ] **Step 3: Implement the provider and factory**

`packages/agent/src/provider/openai-provider.ts`:

```ts
import type { ModelProvider, ModelRequest } from '../types.js';
import { AgentError } from '../errors.js';

export interface OpenAICompatibleOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  fetchImpl?: typeof fetch;
}

export class OpenAICompatibleProvider implements ModelProvider {
  readonly name = 'openai';
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAICompatibleOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async complete(request: ModelRequest): Promise<string> {
    const response = await this.fetchImpl(
      `${this.options.baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.options.model,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.user },
          ],
          temperature: request.temperature ?? 0.2,
          response_format: { type: 'json_object' },
          stream: false,
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new AgentError(
        'PROVIDER_HTTP_ERROR',
        `provider returned ${response.status}${detail ? `: ${detail}` : ''}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new AgentError('PROVIDER_EMPTY_RESPONSE', 'provider returned no content');
    }
    return content;
  }
}
```

`packages/agent/src/provider/create-provider.ts`:

```ts
import type { ModelProvider } from '../types.js';
import { AgentError } from '../errors.js';
import { FakeProvider } from './fake-provider.js';
import { OpenAICompatibleProvider } from './openai-provider.js';

export type ProviderKind = 'auto' | 'fake' | 'openai';

export function createProvider(options: {
  kind: ProviderKind;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): ModelProvider {
  const env = options.env ?? process.env;
  if (options.kind === 'fake') return new FakeProvider();
  if (options.kind === 'auto' && !env.OPENAI_API_KEY) return new FakeProvider();
  if (!env.OPENAI_API_KEY) {
    throw new AgentError(
      'MISSING_API_KEY',
      'OPENAI_API_KEY is required for --provider openai',
    );
  }
  return new OpenAICompatibleProvider({
    apiKey: env.OPENAI_API_KEY,
    baseUrl: env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    model: env.GAMEDREAM_MODEL ?? 'gpt-4o-mini',
    fetchImpl: options.fetchImpl,
  });
}
```

Modify `packages/agent/src/index.ts` to export both.

- [ ] **Step 4: Run the test to verify it passes**

```bash
corepack pnpm vitest run packages/agent/test/openai-provider.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agent
git commit -m "feat(agent): add OpenAI-compatible provider and factory"
```

---

### Task 6: CLI `dream create`

**Files:**
- Create: `packages/cli/src/commands/create.ts`
- Modify: `packages/cli/src/program.ts`
- Modify: `packages/cli/src/errors.ts`
- Test: `packages/cli/test/create.test.ts`

**Interfaces:**
- Consumes: `@gamedream/agent`, `verifyCommand`, `exitCodeFor`.
- Produces:
  - `CreateCommandOptions`
  - `CreateCommandResult { result: CreateResult; verify?: VerifyReport }`
  - `createCommand(options): Promise<CreateCommandResult>`

- [ ] **Step 1: Write the failing test**

`packages/cli/test/create.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { makeTempDir } from '@gamedream/testing';
import { createCommand } from '../src/commands/create.js';
import type { CommandRunner } from '@gamedream/godot';

const root = fileURLToPath(new URL('../../..', import.meta.url));

const fakeGodot: CommandRunner = {
  async run(command, args) {
    if (args[0] === '--version') {
      return { exitCode: 0, stdout: '4.4.1.stable.official\n', stderr: '' };
    }
    return { exitCode: 0, stdout: 'GAMEDREAM_BOOT_OK\nINVENTORY_COUNT=1\n', stderr: '' };
  },
};

function options() {
  return {
    prompt: '做一个俯视角动作 RPG，有背包和 1 个敌人',
    outDir: join(makeTempDir('gamedream create cli '), 'my game'),
    modulesDir: join(root, 'modules'),
    templatesDir: join(root, 'templates'),
    providerKind: 'fake' as const,
    mode: 'auto' as const,
    env: { GODOT_BIN: 'godot' },
    runner: fakeGodot,
  };
}

describe('createCommand', () => {
  it('creates a project and verifies it', async () => {
    const opts = options();
    const { result, verify } = await createCommand(opts);
    expect(result.templateId).toBe('fixture-minimal');
    expect(existsSync(join(opts.outDir, 'gamedream.yaml'))).toBe(true);
    expect(readFileSync(join(opts.outDir, 'gamedream.yaml'), 'utf8')).toContain(
      'template: fixture-minimal',
    );
    expect(verify?.gates.G3.status).toBe('pass');
  });

  it('does not write in dry-run mode', async () => {
    const opts = { ...options(), mode: 'dry-run' as const };
    const { result, verify } = await createCommand(opts);
    expect(result.plannedModules).toContain('core.events');
    expect(verify).toBeUndefined();
    expect(existsSync(join(opts.outDir, 'gamedream.yaml'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
corepack pnpm vitest run packages/cli/test/create.test.ts
```

Expected: FAIL because `createCommand` does not exist.

- [ ] **Step 3: Implement the command and wire it**

`packages/cli/src/commands/create.ts`:

```ts
import {
  createProject,
  createProvider,
  type CreateMode,
  type CreateResult,
  type ProviderKind,
} from '@gamedream/agent';
import type { CommandRunner } from '@gamedream/godot';
import { verifyCommand, type VerifyReport } from './verify.js';

export interface CreateCommandOptions {
  prompt: string;
  outDir: string;
  modulesDir: string;
  templatesDir: string;
  providerKind?: ProviderKind;
  mode?: CreateMode;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  runner?: CommandRunner;
  verify?: boolean;
}

export interface CreateCommandResult {
  result: CreateResult;
  verify?: VerifyReport;
}

export async function createCommand(
  options: CreateCommandOptions,
): Promise<CreateCommandResult> {
  const mode = options.mode ?? 'auto';
  const provider = createProvider({
    kind: options.providerKind ?? 'auto',
    env: options.env,
    fetchImpl: options.fetchImpl,
  });
  const result = await createProject({
    prompt: options.prompt,
    outDir: options.outDir,
    modulesDir: options.modulesDir,
    templatesDir: options.templatesDir,
    provider,
    mode,
  });

  if (mode === 'dry-run' || options.verify === false) return { result };

  const report = await verifyCommand({
    projectDir: result.outDir,
    env: options.env,
    runner: options.runner,
  });
  return { result, verify: report };
}
```

Modify `packages/cli/src/errors.ts` to recognize `AgentError`:

```ts
import { AgentError } from '@gamedream/agent';

// inside formatCliError, before the generic branch:
if (error instanceof AgentError) {
  return {
    message: `${error.code}: ${error.message}`,
    exitCode: error.code === 'MISSING_API_KEY' ? 3 : 2,
  };
}
```

Modify `packages/cli/src/program.ts` to add:

```ts
program
  .command('create')
  .argument('<prompt...>', 'game idea')
  .requiredOption('--out <dir>')
  .option('--modules <dir>', 'modules directory', 'modules')
  .option('--templates <dir>', 'templates directory', 'templates')
  .option('--provider <kind>', 'auto | fake | openai', 'auto')
  .option('--mode <mode>', 'auto | dry-run', 'auto')
  .option('--no-verify', 'skip Godot verification')
  .option('--json', 'print JSON')
  .action(async (promptParts: string[], options: {
    out: string; modules: string; templates: string;
    provider: string; mode: string; verify: boolean; json?: boolean;
  }) => {
    try {
      const { result, verify } = await createCommand({
        prompt: promptParts.join(' '),
        outDir: options.out,
        modulesDir: options.modules,
        templatesDir: options.templates,
        providerKind: options.provider as 'auto' | 'fake' | 'openai',
        mode: options.mode as 'auto' | 'dry-run',
        verify: options.verify,
      });
      if (options.json) {
        printJson({
          outDir: result.outDir,
          templateId: result.templateId,
          provider: result.provider,
          modules: result.compose?.order ?? result.plannedModules,
          verify,
        });
      } else {
        printLine(`Provider: ${result.provider}`);
        printLine(`Template: ${result.templateId} (${result.reason})`);
        printLine(`Project: ${result.outDir}`);
        if (verify) {
          for (const [gate, gateResult] of Object.entries(verify.gates)) {
            printLine(`${gate}: ${gateResult.status}${gateResult.message ? ` (${gateResult.message})` : ''}`);
          }
          process.exitCode = exitCodeFor(verify);
        }
      }
    } catch (error) {
      const formatted = formatCliError(error);
      printLine(formatted.message);
      process.exitCode = formatted.exitCode;
    }
  });
```

Add the imports.

- [ ] **Step 4: Run the test to verify it passes**

```bash
corepack pnpm vitest run packages/cli/test/create.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli packages/agent
git commit -m "feat(cli): add dream create prompt-to-project command"
```

---

### Task 7: Create E2E, docs, and full regression

**Files:**
- Create: `packages/cli/test/create-e2e.test.ts`
- Modify: `README.md`
- Test: full suite

**Interfaces:**
- Consumes: everything above.
- Produces: a real-Godot proof of the one-command flow and usage docs.

- [ ] **Step 1: Write the E2E test**

`packages/cli/test/create-e2e.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir } from '@gamedream/testing';
import { createCommand } from '../src/commands/create.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe.runIf(Boolean(process.env.GODOT_BIN))('create end-to-end', () => {
  it('creates and verifies a project from a prompt with fake provider', async () => {
    const outDir = join(makeTempDir('gamedream create e2e '), 'my game');
    const { verify } = await createCommand({
      prompt: '做一个俯视角动作 RPG，有背包和 1 个敌人',
      outDir,
      modulesDir: join(root, 'modules'),
      templatesDir: join(root, 'templates'),
      providerKind: 'fake',
      mode: 'auto',
    });
    expect(verify?.gates.G1.status).toBe('pass');
    expect(verify?.gates.G2.status).toBe('pass');
    expect(verify?.gates.G3.status).toBe('pass');
  }, 120_000);
});
```

- [ ] **Step 2: Run the E2E with Godot**

```powershell
$env:GODOT_BIN = "C:\path\to\Godot_v4.4.1-stable_win64_console.exe"
corepack pnpm vitest run packages/cli/test/create-e2e.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run the full suite and typecheck**

```bash
corepack pnpm test
corepack pnpm typecheck
```

Expected: all tests pass; no TypeScript errors.

- [ ] **Step 4: Update README**

Add a “One-command create” section:

```markdown
## One-command create

```bash
# offline deterministic provider (no API key)
corepack pnpm exec tsx packages/cli/src/index.ts create \
  "做一个俯视角动作 RPG，有背包和 1 个敌人" \
  --out "tmp/my-game" \
  --provider fake \
  --modules modules \
  --templates templates

# review the plan without writing anything
corepack pnpm exec tsx packages/cli/src/index.ts create \
  "做一个俯视角动作 RPG" \
  --out "tmp/plan-only" \
  --provider fake \
  --mode dry-run \
  --modules modules \
  --templates templates

# real model (OpenAI-compatible)
OPENAI_API_KEY=... GAMEDREAM_MODEL=... \
corepack pnpm exec tsx packages/cli/src/index.ts create "..." --out "tmp/ai-game"
```

`--provider auto` uses OpenAI when `OPENAI_API_KEY` is set, otherwise the fake provider.
`--mode dry-run` writes nothing. `--no-verify` skips Godot verification.
```

- [ ] **Step 5: Commit**

```bash
git add README.md packages/cli/test/create-e2e.test.ts packages/cli packages/agent
git commit -m "test: add create end-to-end flow and docs"
```

---

## Self-Review

**Spec coverage (Plan 2 subset):**

| Spec area | Task |
|---|---|
| Prompt → GameSpec (INTAKE) | Task 2 |
| Genre/template selection (CLASSIFY) | Task 3 |
| COMPOSE + SCAFFOLD via existing composer | Task 4 |
| Model provider abstraction + real provider | Tasks 1, 5 |
| `dream create` + dry-run + verify | Task 6 |
| Offline deterministic tests | Tasks 1–7 |
| Real Godot E2E | Task 7 |

**Not covered by this plan (deferred):**

- Player/AI/combat/gameflow gameplay modules and actual playable movement (Plan 3).
- Delta content generation, levels, UI DSL, assets, quests/dialogue (Plan 3/4).
- Repair loop beyond GameSpec validation repair (later).
- GdUnit4/scenario runner/playtest/screenshots (Plan 4).
- `review` mode interactive confirmation (only `auto`/`dry-run` now).
- Brownfield, MCP addon, Unity/UE/Web.

**Type consistency:** `ModelProvider`/`ModelRequest`; `GameSpecDraft`; `TemplateSelection`; `CreateOptions`/`CreateResult`; `CreateCommandOptions`/`CreateCommandResult`; `ProviderKind = 'auto'|'fake'|'openai'`. The final spec always goes through `parseGameSpec` before writing.

**Review Focus coverage:** invalid JSON repair (Task 2), provider errors/key handling (Task 5/6), template fallback (Task 3), dry-run writes nothing (Task 4/6), duplicate create preserves user files (Task 4/7).
