import { SERVER } from '../src/config';
import { partFrames, partPieces } from '../src/net/protocol';
import type { PaintSystem } from '../src/painting';
import { joinBytes } from '../src/save/paint-file';
import { streamPaint } from '../src/save/save-paint';
import { liveMemory, log, mb, overMemory } from './log';
import { Snapshot, waiting } from './snapshot';

// A session's paint files (session.ts): the newest one kept for SERVER.snapshotKeep,
// one waiting for its turn, and the paint holding still while one reads it.

export class PaintFiles {
  /** The newest paint file whose paint has been read (made or being made), while it's kept; and one waiting for its turn. */
  private snap: Snapshot | null = null;
  private next: Snapshot | null = null;
  /** Paint changes held back while a paint file reads the paint (null: none is), in order. */
  private frozen: (() => void)[] | null = null;

  constructor(
    private code: string,
    private paint: PaintSystem,
    private levelName: string,
  ) {}

  /**
   * A paint file for someone who wants it while `still()`: the newest one (for
   * SAVE only with nothing painted since: SAVE is the paint now), else the one
   * waiting for its turn, else a new one (none when there's no memory for it). While it reads the paint, the paint
   * holds still: what's painted meanwhile is applied after it, and its ops go
   * in the file's log.
   */
  get(still: () => boolean, save = false): Snapshot | 'busy' {
    if (this.snap && !(save && this.snap.log.length)) return this.snap.want(still);
    if (this.next) return this.next.want(still);
    if (overMemory(SERVER.snapshotMemory)) {
      log(this.code, `no memory for a paint file (${liveMemory().toFixed(0)} MB live)`);
      return 'busy';
    }
    const s = (this.next = new Snapshot().want(still));
    const gone = () => this.next === s && (this.next = null);
    s.frames.then(gone, gone);
    s.queue(async () => {
      this.next = null;
      this.snap = s;
      this.frozen = [];
      const t = performance.now();
      try {
        const { pieces, raw } = await streamPaint(this.paint, { name: this.levelName }, SERVER.snapshotChunk);
        const frames = partFrames(pieces, SERVER.partBytes);
        const size = frames.reduce((n, f) => n + f.length, 0);
        log(this.code, `paint file: ${mb(raw)} MB of paint, ${mb(size)} MB packed, in ${((performance.now() - t) / 1000).toFixed(1)} s (${waiting()} more in line)`);
        this.keep(s);
        return frames;
      } catch (e) {
        // Only who waited for it goes without: the next one who wants a paint file gets a new one.
        if (this.snap === s) this.snap = null;
        log(this.code, `paint file failed: ${(e as Error).message}`);
        throw e;
      } finally {
        const held = this.frozen;
        this.frozen = null;
        held!.forEach((f) => f());
      }
    });
    return s;
  }

  /** The paint now as one paint file, made in turn; null when there's no memory for one. */
  async file() {
    const snap = this.get(() => true, true);
    if (snap === 'busy') return null;
    const frames = await snap.frames;
    return frames && joinBytes(partPieces(frames));
  }

  /** `s` is the newest paint file, for SERVER.snapshotKeep. */
  keep(s: Snapshot) {
    this.snap = s;
    setTimeout(() => {
      if (this.snap === s) this.snap = null;
      if (s.served > 1) log(this.code, `paint file served ${s.served}`);
    }, SERVER.snapshotKeep * 1000);
  }

  /** A change to the paint now, or after the paint file that's reading it. */
  now(fn: () => void) {
    if (this.frozen) this.frozen.push(fn);
    else fn();
  }

  /** `frame()`, a paint op relayed, goes in the newest paint file's log: made only if one is open. */
  log(frame: () => Uint8Array) {
    this.snap?.log.push(frame());
  }

  /** The newest paint file is not this paint (it was wiped). */
  forget() {
    this.snap = null;
  }
}
