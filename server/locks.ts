import type { ToClient } from '../src/net/protocol';
import type { SurfaceIndex } from '../src/op-wire';
import type { PaintSystem } from '../src/painting';

// A session's faces locked against paint: admins set them (admins.ts), the paint code stops what would change
// them (src/paint-locks.ts). Every game hears of them, all in its welcome and each change as it comes; a public
// session's are kept on disk with it (kept.ts). A wipe or a restore clears them.

export class SessionLocks {
  /** They changed (kept.ts writes a public session's down). */
  onChange = () => {};

  constructor(
    private paint: PaintSystem,
    private surfaces: SurfaceIndex,
    private tell: (m: ToClient) => void,
  ) {}

  /** Face `rect` of surface number `surface` locked, or unlocked, in every game. */
  set(surface: number, rect: number, on: boolean) {
    const key = this.surfaces.keys[surface];
    const locks = this.paint.locks;
    if (!key || !this.paint.find(key)?.geo.rects[rect] || locks.has(key, rect) === on) return;
    locks.set(key, rect, on);
    this.tell({ type: 'lock', surface, rect, on });
    this.onChange();
  }

  /** As a welcome carries them: surface numbers and faces. */
  wire() {
    return this.paint.locks.list().map(([key, rect]): [number, number] => [this.surfaces.indexOf(key)!, rect]);
  }

  /** By surface key and face (kept.ts). */
  get keys() {
    return this.paint.locks.list();
  }

  /** These in place of any (a kept session's, at start): those its level doesn't have are dropped. */
  restore(list: readonly [string, number][]) {
    this.paint.locks.reset(list.filter(([key, rect]) => this.paint.find(key)?.geo.rects[rect]));
  }

  /** None (a wipe, a restore). */
  clear() {
    if (!this.paint.locks.list().length) return;
    this.paint.locks.reset([]);
    this.onChange();
  }
}
