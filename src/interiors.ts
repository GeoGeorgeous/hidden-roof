import { INTERIORS } from './config';

// Where the sound is indoors. The level has no rooms and nothing in its shapes
// tells one from a canopy, so they're marked by hand, cell by cell on the level's
// grid: a cell has the floors marked on it, whole meters, and a floor is indoors
// up to INTERIORS.height over it.

const cell = (v: number) => Math.floor(v / INTERIORS.cell);
const key = (cx: number, cz: number) => `${cx},${cz}`;
const reaches = (floor: number, y: number) => y >= floor && y - floor < INTERIORS.height;

export class Interiors {
  private cells = new Map<string, number[]>();

  /** Whether this point is over a marked floor of its cell. */
  has(x: number, y: number, z: number) {
    return !!this.cells.get(key(cell(x), cell(z)))?.some((floor) => reaches(floor, y));
  }

  /** Marks or unmarks the point's cell, feet at height `y`: a step or a low block is still the floor it's on. Returns whether that changed anything. */
  set(x: number, y: number, z: number, on: boolean) {
    const k = key(cell(x), cell(z));
    const floors = this.cells.get(k) ?? [];
    const level = Math.round(y);
    if (floors.some((floor) => reaches(floor, level)) === on) return false;
    const next = on ? [...floors, level] : floors.filter((floor) => !reaches(floor, level));
    if (next.length) this.cells.set(k, next);
    else this.cells.delete(k);
    return true;
  }

  /** Every marked floor, as [cell x, floor height, cell z]. */
  list() {
    const out: [number, number, number][] = [];
    for (const [k, floors] of this.cells) {
      const [cx, cz] = k.split(',').map(Number);
      for (const floor of floors) out.push([cx, floor, cz]);
    }
    return out;
  }

  /** Puts back what `list` gave. */
  load(list: [number, number, number][]) {
    this.cells.clear();
    for (const [cx, floor, cz] of list) {
      const k = key(cx, cz);
      this.cells.set(k, [...(this.cells.get(k) ?? []), floor]);
    }
  }
}
