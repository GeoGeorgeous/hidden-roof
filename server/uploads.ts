import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import type http from 'node:http';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { PAINT_DETAIL, SERVER } from '../src/config';
import type { LevelData } from '../src/level/level-data';
import { readPaintHeader } from '../src/save/paint-file';
import { log, mb } from './log';
import { fit } from './paint-fit';
import { Busy, Missing, Refused } from './refused';
import { sessionPaint } from './world';

// The admin's uploaded paint files, in `dir` (DATA_DIR/uploads) as <id>.rhhpaint for SERVER.uploadMinutes: a session is made
// from one, or restored to one (kept.ts). One is streamed to disk, never held in memory but for its check, and one at a time.

/** An uploaded paint file read back: the bytes, the level and detail it was made for, and when it expires (ms). */
export interface Upload {
  id: string;
  bytes: Uint8Array;
  level: string;
  detail: number;
  expires: number;
}

/** What an upload id looks like (they are file names: nothing else gets to the disk). */
export const isUploadId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f]{16}$/.test(id);

export class Uploads {
  private checking = false;

  /** `levelOf`: a level by name, Refused if there is none (kept.ts). */
  constructor(
    private dir: string,
    private levelOf: (name: string) => Promise<LevelData>,
  ) {}

  /** At start: the directory exists, what a crash left or has expired is gone, and that is checked every SERVER.uploadCheck s. */
  async start() {
    await fs.mkdir(this.dir, { recursive: true });
    await this.sweep(true);
    setInterval(() => void this.sweep(false).catch((e) => log('-----', 'uploads not cleaned:', e)), SERVER.uploadCheck * 1000).unref();
  }

  /**
   * The body of `req`, a paint file, kept: streamed to disk up to SERVER.uploadBytes, then checked as a save is loaded
   * (paint-fit.ts: it is of a level of ours, at a detail of ours, its surfaces fit and it inflates whole). Refused with
   * why if not; Busy while another is being checked.
   */
  async put(req: http.IncomingMessage) {
    if (this.checking) throw new Busy('an upload is being checked');
    this.checking = true;
    const id = randomBytes(8).toString('hex');
    const tmp = this.file(`${id}.rhhpaint.tmp`);
    try {
      // Past the limit the rest is read and dropped, so the connection stays good for the answer.
      let size = 0;
      await pipeline(
        Readable.from(
          (async function* () {
            for await (const chunk of req as AsyncIterable<Buffer>) if ((size += chunk.length) <= SERVER.uploadBytes) yield chunk;
          })(),
        ),
        createWriteStream(tmp),
      );
      if (size > SERVER.uploadBytes) throw new Refused(`too big: up to ${SERVER.uploadBytes / 2 ** 20} MB`);
      const bytes = await fs.readFile(tmp);
      let header;
      try {
        header = readPaintHeader(bytes).header;
      } catch (e) {
        throw new Refused((e as Error).message);
      }
      const { name: level } = header.level;
      if (!Object.values(PAINT_DETAIL).includes(header.density)) throw new Refused(`detail: ${header.density} texels per meter is none of ${Object.keys(PAINT_DETAIL).join(', ')}`);
      const { paint, drips } = sessionPaint(await this.levelOf(level), header.density);
      await fit(bytes, level, header.density, paint, drips);
      await fs.rename(tmp, this.file(`${id}.rhhpaint`));
      log('-----', `upload ${id}: ${level} at ${header.density} texels/m, ${mb(bytes.length)} MB`);
      return { id, level, detail: header.density, bytes: bytes.length, expires: Date.now() + SERVER.uploadMinutes * 60000 };
    } finally {
      this.checking = false;
      await fs.rm(tmp, { force: true });
    }
  }

  /** An upload by its id, with its paint file; Missing (404) if there is none or it has expired. */
  async read(id: string): Promise<Upload> {
    const gone = new Missing(`no upload ${id}: it may have expired (${SERVER.uploadMinutes} min)`);
    if (!isUploadId(id)) throw gone;
    const file = this.file(`${id}.rhhpaint`);
    const stat = await fs.stat(file).catch(() => null);
    const expires = stat ? stat.mtimeMs + SERVER.uploadMinutes * 60000 : 0;
    if (!stat || expires <= Date.now()) throw gone;
    const bytes = await fs.readFile(file);
    const { header } = readPaintHeader(bytes);
    return { id, bytes, level: header.level.name, detail: header.density, expires };
  }

  /** Uploads past their time gone; `all`: and what a crash left half written. */
  private async sweep(all: boolean) {
    const limit = Date.now() - SERVER.uploadMinutes * 60000;
    for (const name of await fs.readdir(this.dir)) {
      const old = await fs.stat(this.file(name)).then((s) => s.mtimeMs <= limit, () => false);
      if ((all && name.endsWith('.tmp')) || old) await fs.rm(this.file(name), { force: true });
    }
  }

  private file(name: string) {
    return path.join(this.dir, name);
  }
}
