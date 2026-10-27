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
const savedAt = (code: string, name: string) => parseInt(name.slice(code.length + 1));
export const isWiped = (name: string) => name.endsWith('.wiped.rhhpaint');
/** What a crash can leave half written. */
export const leftover = (name: string) => name === 'sessions.json.tmp' || name.endsWith('.rhhpaint.tmp') || /-\d+(\.wiped)?\.json\.tmp$/.test(name);

/** Of saves made at `times` (ms), the ones to keep at `now`: the newest, and for each of `ages` (s) the newest at least that old (age 0 is the newest of all). One that fills two slots is kept once. */
export function keepers(times: number[], now: number, ages: readonly number[]) {
  const keep = new Set<number>();
  for (const age of ages) {
    const old = times.filter((t) => age === 0 || now - t >= age * 1000);
    if (old.length) keep.add(Math.max(...old));
  }
  return keep;
}

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

  /** The stats a save was written with, or null (none, or not good); `restoredAt` (ms): as restored then. */
  async stats(name: string, restoredAt?: number) {
    return SessionStats.from(await fs.readFile(this.file(statsName(name)), 'utf8').then(JSON.parse, () => null), restoredAt === undefined ? undefined : 'restored', restoredAt);
  }

  /** A save and its stats gone. */
  async remove(name: string) {
    await Promise.all([fs.rm(this.file(name), { force: true }), fs.rm(this.file(statsName(name)), { force: true })]);
  }

  /** A session's saves put aside as wiped, replacing the ones put aside before; none to put aside leaves those. */
  async aside(code: string) {
    const all = await this.list(code);
    const now = all.filter((n) => !isWiped(n));
    if (!now.length) return;
    for (const n of all.filter(isWiped)) await this.remove(n);
    for (const n of now) {
      const to = n.replace('.rhhpaint', '.wiped.rhhpaint');
      await fs.rename(this.file(n), this.file(to));
      await fs.rename(this.file(statsName(n)), this.file(statsName(to))).catch(() => {});
    }
  }

  /** After a save, the ones not worth keeping gone (`keepers`); `pinned` stays too. */
  async tidy(code: string, pinned?: number) {
    const now = (await this.list(code)).filter((n) => !isWiped(n));
    const keep = keepers(now.map((n) => savedAt(code, n)), Date.now(), SERVER.keepAges);
    for (const n of now) if (!keep.has(savedAt(code, n)) && savedAt(code, n) !== pinned) await this.remove(n);
  }

  /** The save made at `ms`, wiped or not, or null. */
  async find(code: string, ms: number) {
    return (await this.list(code)).find((n) => savedAt(code, n) === ms) ?? null;
  }

  /** A session's saves for the admin page, newest first: when (ISO), how big, whether wiped, and the stats' stamps (all tools but the sponge) and painters. One rotated away meanwhile is left out. */
  async info(code: string) {
    const list = await Promise.all(
      (await this.list(code)).map(async (n) => {
        const size = await fs.stat(this.file(n)).then((f) => f.size, () => null);
        if (size === null) return null;
        const s = (await this.stats(n))?.report([]);
        return { at: new Date(savedAt(code, n)).toISOString(), bytes: size, wiped: isWiped(n), stats: s ? { stamps: s.stamps.can + s.stamps.marker + s.stamps.roller, painters: s.painters } : null };
      }),
    );
    return list.filter((s) => s !== null);
  }

  /** Every file of a session's, saves and what a crash left of one. */
  async forget(code: string) {
    for (const name of (await fs.readdir(this.dir)).filter((n) => n.startsWith(`${code}-`))) await fs.rm(this.file(name), { force: true });
  }
}
