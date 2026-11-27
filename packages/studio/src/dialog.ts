import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type DialogKind = 'file' | 'folder';

export interface DialogRequest {
  kind: DialogKind;
  title?: string;
  filter?: string;
}

export interface DialogInvocation {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

function text(value: string | undefined, fallback: string): string {
  const cleaned = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, 200);
  return cleaned || fallback;
}

function windowsInvocation(request: DialogRequest): DialogInvocation {
  const folder = request.kind === 'folder';
  const script = folder
    ? [
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
        'Add-Type -AssemblyName System.Windows.Forms',
        '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
        '$dialog.Description = $env:GAMEDREAM_DIALOG_TITLE',
        '$dialog.ShowNewFolderButton = $true',
        "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) }",
      ].join('; ')
    : [
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
        'Add-Type -AssemblyName System.Windows.Forms',
        '$dialog = New-Object System.Windows.Forms.OpenFileDialog',
        '$dialog.Title = $env:GAMEDREAM_DIALOG_TITLE',
        '$dialog.Filter = $env:GAMEDREAM_DIALOG_FILTER',
        '$dialog.CheckFileExists = $true',
        "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.FileName) }",
      ].join('; ');
  return {
    command: 'powershell.exe',
    args: ['-NoProfile', '-STA', '-Command', script],
    env: {
      ...process.env,
      GAMEDREAM_DIALOG_TITLE: text(request.title, folder ? '选择文件夹' : '选择文件'),
      GAMEDREAM_DIALOG_FILTER: text(
        request.filter,
        folder ? '' : 'JSON (*.json)|*.json|All files (*.*)|*.*',
      ),
    },
  };
}

function macInvocation(request: DialogRequest): DialogInvocation {
  const folder = request.kind === 'folder';
  const script = [
    'set titleText to system attribute "GAMEDREAM_DIALOG_TITLE"',
    'try',
    folder
      ? 'set picked to choose folder with prompt titleText'
      : 'set picked to choose file with prompt titleText',
    'return POSIX path of picked',
    'on error number -128',
    'return ""',
    'end try',
  ].join('\n');
  return {
    command: 'osascript',
    args: ['-e', script],
    env: {
      ...process.env,
      GAMEDREAM_DIALOG_TITLE: text(request.title, folder ? '选择文件夹' : '选择文件'),
    },
  };
}

function linuxInvocation(
  request: DialogRequest,
  command = 'zenity',
): DialogInvocation {
  const folder = request.kind === 'folder';
  const title = text(request.title, folder ? '选择文件夹' : '选择文件');
  const filter = text(
    request.filter,
    folder ? '' : 'JSON (*.json)|*.json|All files (*.*)|*.*',
  );
  if (command === 'kdialog') {
    return {
      command,
      args: folder
        ? ['--getexistingdirectory', '.', '--title', title]
        : ['--getopenfilename', '.', '--title', title],
      env: { ...process.env },
    };
  }
  return {
    command,
    args: [
      '--file-selection',
      '--title',
      title,
      ...(folder ? ['--directory'] : []),
      ...(!folder && filter ? [`--file-filter=${filter}`] : []),
    ],
    env: { ...process.env },
  };
}

export function dialogInvocation(
  platform: NodeJS.Platform,
  request: DialogRequest,
): DialogInvocation {
  if (platform === 'win32') return windowsInvocation(request);
  if (platform === 'darwin') return macInvocation(request);
  return linuxInvocation(request);
}

function clean(value: string): string | undefined {
  const path = value.replace(/^\uFEFF/, '').trim();
  return path || undefined;
}

function canceled(error: unknown): boolean {
  const value = error as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
  const code = Number(value.code);
  return (code === 1 || code === 255)
    && !String(value.stderr ?? '').trim()
    && !String(value.stdout ?? '').trim();
}

async function run(invocation: DialogInvocation): Promise<{ stdout: string }> {
  return execFileAsync(invocation.command, invocation.args, {
    env: invocation.env,
    timeout: 5 * 60_000,
    maxBuffer: 1024 * 1024,
    windowsHide: true,
  });
}

export async function pickPath(request: DialogRequest): Promise<string | undefined> {
  const invocation = dialogInvocation(process.platform, request);
  try {
    return clean((await run(invocation)).stdout);
  } catch (error) {
    if (canceled(error)) return undefined;
    if (
      process.platform !== 'win32'
      && process.platform !== 'darwin'
      && (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      try {
        return clean((await run(linuxInvocation(request, 'kdialog'))).stdout);
      } catch (fallback) {
        if (canceled(fallback)) return undefined;
        throw new Error(
          `无法打开系统文件选择器；请确认已安装 zenity 或 kdialog，或直接输入路径。`,
        );
      }
    }
    throw new Error(
      `无法打开系统文件选择器：${(error as Error).message.replace(/\s+/g, ' ').slice(0, 240)}`,
    );
  }
}

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  return address === '127.0.0.1'
    || address === '::1'
    || address === '::ffff:127.0.0.1';
}
