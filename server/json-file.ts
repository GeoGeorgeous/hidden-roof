import fs from 'node:fs/promises';

/** A JSON file's value; null if the file is not there. Throws if it can't be read or is not JSON (the caller decides what a corrupt one is worth). */
export async function readJson<T>(file: string): Promise<T | null> {
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
  return JSON.parse(text) as T;
}
