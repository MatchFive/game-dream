import {
  captureWebScreenshot,
  composeWebProject,
  verifyWebProject,
  verifyWebVisual,
} from '@gamedream/web';

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

export function webScreenshotCommand(options: {
  projectDir: string;
  outPath?: string;
  width?: number;
  height?: number;
  browserBin?: string;
}) {
  return captureWebScreenshot(options);
}

export function webVerifyVisualCommand(options: {
  projectDir: string;
  outPath?: string;
  width?: number;
  height?: number;
  browserBin?: string;
}) {
  return verifyWebVisual(options);
}
