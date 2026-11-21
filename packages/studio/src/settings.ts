import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export interface StudioSettings {
  model: {
    provider: 'auto' | 'fake' | 'openai';
    model: string;
    baseUrl: string;
    apiKey: string;
  };
  image: {
    url: string;
    workflow: string;
  };
  engines: {
    godotBin: string;
    unityBin: string;
  };
}

export interface PublicStudioSettings extends Omit<StudioSettings, 'model'> {
  model: Omit<StudioSettings['model'], 'apiKey'> & {
    hasApiKey: boolean;
  };
}

const DEFAULT_IMAGE_URL = 'http://192.168.124.56:8000';
const DEFAULT_WORKFLOW = 'D:/QQ/image_qwen_image_2_1_t2i.json';

export function settingsPath(workspaceDir: string): string {
  return join(resolve(workspaceDir), '.gamedream', 'studio', 'settings.json');
}

export function defaultSettings(env: NodeJS.ProcessEnv = process.env): StudioSettings {
  const provider = env.GAMEDREAM_PROVIDER;
  return {
    model: {
      provider: provider === 'fake' || provider === 'openai' ? provider : 'auto',
      model: env.GAMEDREAM_MODEL ?? 'gpt-4o-mini',
      baseUrl: env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
      apiKey: env.OPENAI_API_KEY ?? '',
    },
    image: {
      url: env.COMFYUI_URL ?? DEFAULT_IMAGE_URL,
      workflow: env.COMFYUI_WORKFLOW ?? DEFAULT_WORKFLOW,
    },
    engines: {
      godotBin: env.GODOT_BIN ?? '',
      unityBin: env.UNITY_BIN ?? '',
    },
  };
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

export function loadStudioSettings(
  workspaceDir: string,
  env: NodeJS.ProcessEnv = process.env,
): StudioSettings {
  const defaults = defaultSettings(env);
  const file = settingsPath(workspaceDir);
  if (!existsSync(file)) return defaults;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<StudioSettings>;
    const model = (raw.model ?? {}) as Partial<StudioSettings['model']>;
    const image = (raw.image ?? {}) as Partial<StudioSettings['image']>;
    const engines = (raw.engines ?? {}) as Partial<StudioSettings['engines']>;
    const provider = model.provider;
    return {
      model: {
        provider: provider === 'fake' || provider === 'openai' || provider === 'auto'
          ? provider
          : defaults.model.provider,
        model: stringValue(model.model, defaults.model.model),
        baseUrl: stringValue(model.baseUrl, defaults.model.baseUrl),
        apiKey: stringValue(model.apiKey, defaults.model.apiKey),
      },
      image: {
        url: stringValue(image.url, defaults.image.url),
        workflow: stringValue(image.workflow, defaults.image.workflow),
      },
      engines: {
        godotBin: stringValue(engines.godotBin, defaults.engines.godotBin),
        unityBin: stringValue(engines.unityBin, defaults.engines.unityBin),
      },
    };
  } catch {
    return defaults;
  }
}

export function saveStudioSettings(
  workspaceDir: string,
  current: StudioSettings,
  patch: {
    model?: Partial<StudioSettings['model']>;
    image?: Partial<StudioSettings['image']>;
    engines?: Partial<StudioSettings['engines']>;
  },
): StudioSettings {
  const model = { ...current.model, ...(patch.model ?? {}) };
  if (!patch.model?.apiKey) model.apiKey = current.model.apiKey;
  const next: StudioSettings = {
    model: {
      provider: model.provider === 'fake' || model.provider === 'openai' ? model.provider : 'auto',
      model: String(model.model ?? '').trim() || current.model.model,
      baseUrl: String(model.baseUrl ?? '').trim() || current.model.baseUrl,
      apiKey: String(model.apiKey ?? ''),
    },
    image: {
      url: String(patch.image?.url ?? current.image.url).trim() || current.image.url,
      workflow: String(patch.image?.workflow ?? current.image.workflow).trim()
        || current.image.workflow,
    },
    engines: {
      godotBin: String(patch.engines?.godotBin ?? current.engines.godotBin).trim(),
      unityBin: String(patch.engines?.unityBin ?? current.engines.unityBin).trim(),
    },
  };
  const file = settingsPath(workspaceDir);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

export function publicStudioSettings(settings: StudioSettings): PublicStudioSettings {
  return {
    image: settings.image,
    engines: settings.engines,
    model: {
      provider: settings.model.provider,
      model: settings.model.model,
      baseUrl: settings.model.baseUrl,
      hasApiKey: Boolean(settings.model.apiKey),
    },
  };
}

export function studioEnv(settings: StudioSettings): NodeJS.ProcessEnv {
  return {
    OPENAI_API_KEY: settings.model.apiKey || process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: settings.model.baseUrl,
    GAMEDREAM_MODEL: settings.model.model,
    GAMEDREAM_PROVIDER: settings.model.provider,
    COMFYUI_URL: settings.image.url,
    COMFYUI_WORKFLOW: settings.image.workflow,
    GODOT_BIN: settings.engines.godotBin || process.env.GODOT_BIN,
    UNITY_BIN: settings.engines.unityBin || process.env.UNITY_BIN,
  };
}
