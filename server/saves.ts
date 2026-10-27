import fs from 'node:fs/promises';
import path from 'node:path';
import { SERVER } from '../src/config';
import { SessionStats } from './counts';

// A kept session's saves in DATA_DIR (kept.ts decides which, this is how they lie on disk):
// <code>-<ms>.rhhpaint is the paint at that time, <code>-<ms>.json its stats (counts.ts),
// and a wipe renames both to <code>-<ms>.wiped.rhhpaint and <code>-<ms>.wiped.json.

/** The stats file of a save, from its paint file's name. */
const statsName = (name: string) => name.replace(/\.rhhpaint$/, '.json');
/** When a save was made (ms), from its name. */
export const savedAt = (code: string, name: string) => parseInt(name.slice(code.length + 1));
export const isWiped = (name: string) => name.endsWith('.wiped.rhhpaint');
/** What a crash can leave half written. */
export const leftover = (name: string) => name === 'sessions.json.tmp' || name.endsWith('.rhhpaint.tmp') || /-\d+(\.wiped)?\.json\.tmp$/.test(name);

export class Saves {
  constructor(readonly dir: string) {}

  file(name: string) {
    return path.join(this.dir, name);
  }

  /** A session's saves, wiped ones included, newest first. */
  async list(code: string) {
    const names = (await fs.readdir(this.dir)).filter((n) => n.startsWith(`${code}-`) && n.endsWith('.rhhpaint'));
    return names.sort((a, b) => savedAt(code, b) - savedAt(code, a));
  }

  /** `bytes` and `stats` as the save `name`, paint first: a stats file with no paint is never left behind, a paint file with no stats just has none. */
  async write(name: string, bytes: Uint8Array, stats: object) {
    await this.atomic(name, bytes);
    await this.atomic(statsName(name), JSON.stringify(stats));
  }

  private async atomic(name: string, data: Uint8Array | string) {
    try {
      await fs.writeFile(this.file(`${name}.tmp`), data);
      await fs.rename(this.file(`${name}.tmp`), this.file(name));
    } catch (e) {
      await fs.rm(this.file(`${name}.tmp`), { force: true });
      throw e;
    }
  }

  /** The stats a save was written with, or null (none, or not good). */
  async stats(name: string) {
    return SessionStats.from(await fs.readFile(this.file(statsName(name)), 'utf8').then(JSON.parse, () => null));
  }

  /** A save and its stats gone. */
  async remove(name: string) {
    await Promise.all([fs.rm(this.file(name), { force: true }), fs.rm(this.file(statsName(name)), { force: true })]);
  }

  /** A session's newest SERVER.keepFiles saves put aside as wiped, and the rest gone. */
  async aside(code: string) {
    for (const [i, n] of (await this.list(code)).entries()) {
      if (i >= SERVER.keepFiles) await this.remove(n);
      else if (!isWiped(n)) {
        const to = n.replace('.rhhpaint', '.wiped.rhhpaint');
        await fs.rename(this.file(n), this.file(to));
        await fs.rename(this.file(statsName(n)), this.file(statsName(to))).catch(() => {});
      }
    }
  }

  /** Every file of a session's, saves and what a crash left of one. */
  async forget(code: string) {
    for (const name of (await fs.readdir(this.dir)).filter((n) => n.startsWith(`${code}-`))) await fs.rm(this.file(name), { force: true });
  }
}
