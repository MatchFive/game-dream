import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dialogInvocation, isLoopbackAddress } from '../src/dialog.js';
import { startStudioServer } from '../src/server.js';

describe('native path picker', () => {
  it('builds a PowerShell invocation for Windows file and folder dialogs', () => {
    const file = dialogInvocation('win32', {
      kind: 'file',
      title: 'Pick JSON',
      filter: 'JSON (*.json)|*.json',
    });
    expect(file.command).toBe('powershell.exe');
    expect(file.args).toContain('-STA');
    expect(file.env.GAMEDREAM_DIALOG_TITLE).toBe('Pick JSON');
    expect(file.env.GAMEDREAM_DIALOG_FILTER).toBe('JSON (*.json)|*.json');

    const folder = dialogInvocation('win32', { kind: 'folder' });
    expect(folder.args.join(' ')).toContain('FolderBrowserDialog');
    expect(folder.env.GAMEDREAM_DIALOG_TITLE).toBe('选择文件夹');
  });

  it('builds macOS and Linux invocations', () => {
    const mac = dialogInvocation('darwin', { kind: 'folder' });
    expect(mac.command).toBe('osascript');
    expect(mac.args.join('\n')).toContain('choose folder');

    const linux = dialogInvocation('linux', { kind: 'file', title: 'Pick' });
    expect(linux.command).toBe('zenity');
    expect(linux.args).toContain('--file-selection');
    expect(linux.args).toContain('--title');
  });

  it('recognizes loopback addresses only', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('192.168.1.8')).toBe(false);
    expect(isLoopbackAddress(undefined)).toBe(false);
  });

  it('returns an injected dialog path through the API', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gamedream-dialog-'));
    const studio = await startStudioServer({
      projectDir: root,
      port: 0,
      openDialog: async (request) => {
        expect(request.kind).toBe('folder');
        return 'D:/picked-project';
      },
    });
    try {
      const response = await fetch(`${studio.url}/api/dialog`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'folder', title: 'Pick project' }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ path: 'D:/picked-project' });
    } finally {
      await studio.close();
    }
  });
});
