import { encode, type ToClient } from '../src/net/protocol';
import type { SurfaceIndex } from '../src/op-wire';
import { PaintLocks } from '../src/paint-locks';
import type { PaintSystem } from '../src/painting';
import type { PaintFiles } from './paint-files';

// A session's faces locked against paint: admins set them (admins.ts), the paint code stops what would change
// them (src/paint-locks.ts). Every game hears of them, all in its welcome and each change as it comes; a public
// session's are kept on disk with it (kept.ts). A wipe or a restore clears them. A change goes in order with the
// paint: into the paint file's log after the ops before it (a joiner replays both as they came), and onto the
// server's paint after the changes held back while a paint file reads it (paint-files.ts now).

export class SessionLocks {
  /** They changed (kept.ts writes a public session's down). */
  onChange = () => {};
  /** As the admins left them; the paint's (`paint.locks`) catch up after the paint changes held back. */
  private wanted = new PaintLocks(() => undefined);

  constructor(
    private paint: PaintSystem,
    private surfaces: SurfaceIndex,
    private files: PaintFiles,
    private tell: (m: ToClient) => void,
  ) {}

  /** Face `rect` of surface number `surface` locked, or unlocked, in every game. */
  set(surface: number, rect: number, on: boolean) {
    const key = this.surfaces.keys[surface];
    if (!key || !this.paint.find(key)?.geo.rects[rect] || this.wanted.has(key, rect) === on) return;
    this.wanted.set(key, rect, on);
    const m: ToClient = { type: 'lock', surface, rect, on };
    this.tell(m);
    this.files.log(() => encode(m));
    this.files.now(() => this.paint.locks.set(key, rect, on));
    this.onChange();
  }

  /** The paint's now, as a welcome carries them: surface numbers and faces (a paint file's, paint-files.ts). */
  wire() {
    return this.paint.locks.list().map(([key, rect]): [number, number] => [this.surfaces.indexOf(key)!, rect]);
  }

  /** By surface key and face (kept.ts). */
  get keys() {
    return this.wanted.list();
  }

  /** These in place of any (a kept session's, at start): those its level doesn't have are dropped. */
  restore(list: readonly [string, number][]) {
    const kept = list.filter(([key, rect]) => this.paint.find(key)?.geo.rects[rect]);
    this.wanted.reset(kept);
    this.paint.locks.reset(kept);
  }

  /** None (a wipe, a restore). */
  clear() {
    const had = this.wanted.list().length;
    this.wanted.reset([]);
    this.paint.locks.reset([]);
    if (had) this.onChange();
  }
}
