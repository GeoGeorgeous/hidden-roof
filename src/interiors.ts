import { INTERIORS } from './config';
import type { InteriorCell } from './level/level-data';

// Where the sound is indoors. The level has no rooms and nothing in its shapes
// tells one from a canopy, so they're marked by hand, cell by cell on the level's
// grid: a cell has the floors marked on it, whole meters, and each reaches up as
// far as it was marked to, INTERIORS.height unless something was in the way.

type Mark = { floor: number; height: number };

const cell = (v: number) => Math.floor(v / INTERIORS.cell);
const key = (cx: number, cz: number) => `${cx},${cz}`;
/** Feet at `y` are on this mark: a step or a low block is still the floor it's on. */
const reaches = ({ floor, height }: Mark, y: number) => Math.round(y) >= floor && y < floor + height;

export class Interiors {
  private cells = new Map<string, Mark[]>();

  /** Whether feet at this point are over a marked floor of its cell. */
  has(x: number, y: number, z: number) {
    return !!this.cells.get(key(cell(x), cell(z)))?.some((mark) => reaches(mark, y));
  }

  /** Marks the point's cell, feet at height `y`, `height` up from the floor they're on, or takes off the mark they're on. Returns whether that changed anything. */
  set(x: number, y: number, z: number, on: boolean, height: number = INTERIORS.height) {
    const k = key(cell(x), cell(z));
    const marks = this.cells.get(k) ?? [];
    if (marks.some((mark) => reaches(mark, y)) === on) return false;
    const next = on ? [...marks, { floor: Math.round(y), height }] : marks.filter((mark) => !reaches(mark, y));
    if (next.length) this.cells.set(k, next);
    else this.cells.delete(k);
    return true;
  }

  /** Every mark, as the level file has it. */
  list() {
    const out: InteriorCell[] = [];
    for (const [k, marks] of this.cells) {
      const [cx, cz] = k.split(',').map(Number);
      for (const { floor, height } of marks) out.push(height === INTERIORS.height ? [cx, floor, cz] : [cx, floor, cz, height]);
    }
    return out;
  }

  /** Puts back what `list` gave. */
  load(list: InteriorCell[]) {
    this.cells.clear();
    for (const [cx, floor, cz, height = INTERIORS.height] of list) {
      const k = key(cx, cz);
      this.cells.set(k, [...(this.cells.get(k) ?? []), { floor, height }]);
    }
  }
}
