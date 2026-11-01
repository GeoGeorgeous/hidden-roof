import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/** The name a half-written `file` has: beside it, one of its own for each write, <file>.<8 hex>.tmp (saves.ts leftover knows it). */
const tmpOf = (file: string) => `${file}.${randomBytes(4).toString('hex')}.tmp`;

/**
 * `data` in `file`, whole or not at all: written beside it under a name of its own, flushed to the disk, then renamed over it; a failed write
 * leaves no such file. `data` is the bytes, or a function that writes them to the file it is given (it may throw, and then nothing is
 * renamed). `mode`: a new file's.
 */
export async function writeAtomic(file: string, data: string | Uint8Array | ((out: fs.FileHandle) => Promise<void>), mode?: number) {
  const tmp = tmpOf(file);
  try {
    const out = await fs.open(tmp, 'w+', mode);
    try {
      await (typeof data === 'function' ? data(out) : out.writeFile(data));
      await out.sync();
    } finally {
      await out.close();
    }
    await fs.rename(tmp, file);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
  await syncDir(path.dirname(file));
}

/** The directory flushed, so the rename survives a power loss; where that can't be done, as it is. */
async function syncDir(dir: string) {
  try {
    const d = await fs.open(dir, 'r');
    await d.sync().finally(() => d.close());
  } catch {
    // Not every system lets a directory be flushed.
  }
}
