import {
  composeUnityProject,
  verifyUnityProject,
  type ComposeUnityOptions,
  type UnityGameConfig,
} from '@gamedream/unity';

export function unityComposeCommand(options: ComposeUnityOptions) {
  return composeUnityProject(options);
}

export function unityVerifyCommand(options: { projectDir: string }) {
  return verifyUnityProject(options);
}

export type { UnityGameConfig };
