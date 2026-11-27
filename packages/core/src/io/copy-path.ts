import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Recursively copy a file or a directory tree.
 *
 * `fs.cpSync` must not be used for project output paths on Windows: when the
 * source or the destination contains non-ASCII characters it throws ENOENT for
 * directories and, for non-ASCII sources, can crash the process with a native
 * segmentation fault (exit 139) that no `try/catch` can intercept. Project
 * output paths come from user input ("我的游戏"), so composition has to own the
 * copy instead of delegating to the unreliable sync implementation.
 *
 * Semantics match `fs.cpSync(source, target, { recursive: true, force: true })`
 * for the cases the composer needs: directories merge into existing targets,
 * files overwrite, and symlinks are recreated rather than dereferenced.
 */
export function copyPath(source: string, target: string): void {
  const info = lstatSync(source);

  if (info.isSymbolicLink()) {
    const link = readlinkSync(source);
    mkdirSync(dirname(target), { recursive: true });
    // force: true semantics — replace whatever is already at the target path.
    rmSync(target, { recursive: true, force: true });
    symlinkSync(link, target);
    return;
  }

  if (info.isDirectory()) {
    mkdirSync(target, { recursive: true });
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      copyPath(join(source, entry.name), join(target, entry.name));
    }
    return;
  }

  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}
