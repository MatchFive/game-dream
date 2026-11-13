import { composeWebProject, verifyWebProject } from '@gamedream/web';

export interface WebComposeOptions {
  outDir: string;
  templatesDir?: string;
  contentDir?: string;
  modulesDir?: string;
  name?: string;
  force?: boolean;
}

export function webComposeCommand(options: WebComposeOptions) {
  return composeWebProject(options);
}

export function webVerifyCommand(options: { projectDir: string; frames?: number }) {
  return verifyWebProject(options);
}
