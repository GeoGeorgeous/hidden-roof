import fs from 'node:fs/promises';

/** `data` in `file`, whole or not at all: written beside it as <file>.tmp, then renamed over it; a failed write leaves no .tmp. `mode`: a new file's. */
export async function writeAtomic(file: string, data: string | Uint8Array, mode?: number) {
  const tmp = `${file}.tmp`;
  try {
    await fs.writeFile(tmp, data, mode === undefined ? undefined : { mode });
    await fs.rename(tmp, file);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
}
