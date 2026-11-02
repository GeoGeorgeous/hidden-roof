import type { Rect } from './surfaces';

// Faces locked against paint (an admin's, in a session: server/admins.ts): a locked face's Rect says so, and no
// stamp, roll, run or seam spill changes its paint (painting.ts), on the server and in every game. Kept by surface
// key and face, so a surface built again (a prop rebuilt) is locked again when it registers.

export class PaintLocks {
  private faces = new Map<string, Set<number>>();
  /** Paint this player made was stopped by a lock since the last takeHit(). */
  private hit = false;

  constructor(private rectsOf: (key: string) => Rect[] | undefined) {}

  /** Face `rect` of surface `key` locked, or unlocked. */
  set(key: string, rect: number, on: boolean) {
    const set = this.faces.get(key) ?? new Set();
    if (on) this.faces.set(key, set.add(rect));
    else if (set.delete(rect) && !set.size) this.faces.delete(key);
    const r = this.rectsOf(key)?.[rect];
    if (r) r.locked = on;
  }

  /** These faces locked, and no other. */
  reset(list: readonly (readonly [string, number])[]) {
    for (const [key, rect] of this.list()) this.set(key, rect, false);
    for (const [key, rect] of list) this.set(key, rect, true);
  }

  /** Surface `key` is built (again): its locked faces say so. */
  mark(key: string, rects: Rect[]) {
    for (const i of this.faces.get(key) ?? []) if (rects[i]) rects[i].locked = true;
  }

  has(key: string, rect: number) {
    return !!this.faces.get(key)?.has(rect);
  }

  /** Every locked face, as surface key and face. */
  list(): [string, number][] {
    return [...this.faces].flatMap(([key, set]) => [...set].map((rect): [string, number] => [key, rect]));
  }

  /** A stamp or roll of this player's met a locked face. */
  stopped() {
    this.hit = true;
  }

  /** Whether paint was stopped by a lock since the last call (the toast, once a frame). */
  takeHit() {
    const was = this.hit;
    this.hit = false;
    return was;
  }
}
