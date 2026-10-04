import { CAP_ORDER, COLOR_ORDER, type CapId, type PaintColor } from '../config';

// Five slots: 1 = the spray can (always), 2 = the marker, 3 = the stepladder,
// 4 = the paint roller, 5 = the sponge (each once found).
// Colors and caps are permanent unlocks (colors shared by can, marker and roller).
// Paint never runs out; the can only has pressure.

export type Tool = 'can' | 'marker' | 'ladder' | 'roller' | 'sponge';
export const SLOTS: Tool[] = ['can', 'marker', 'ladder', 'roller', 'sponge'];

export class Inventory {
  selected = 0;
  colors: PaintColor[] = [];
  caps: CapId[] = [];
  /** Can pressure 0..1: drains while spraying, restored by shaking. */
  pressure = 1;
  /** Bumped on every change so the HUD can skip redundant DOM updates. */
  version = 0;
  /** Tools found so far (the can is always there). */
  private found = new Set<Tool>();
  private colorIndex = 0;
  private capIndex = 0;

  constructor() {
    this.reset();
  }

  /** Starting kit: the can, black, standard cap, none of the other tools. */
  reset() {
    this.selected = 0;
    this.found.clear();
    this.colors = ['black'];
    this.caps = ['standard'];
    this.pressure = 1;
    this.colorIndex = 0;
    this.capIndex = 0;
    this.version++;
  }

  get color(): PaintColor {
    return this.colors[this.colorIndex];
  }

  get cap(): CapId {
    return this.caps[this.capIndex];
  }

  /** The tool in hand, or null if its slot is selected before it was found. */
  get tool(): Tool | null {
    const t = SLOTS[this.selected];
    return this.has(t) ? t : null;
  }

  /** Has this tool been found? (The can is always there.) */
  has(t: Tool) {
    return t === 'can' || this.found.has(t);
  }

  select(i: number) {
    if (i === this.selected || i < 0 || i >= SLOTS.length) return;
    this.selected = i;
    this.version++;
  }

  cycleColor(dir: number) {
    return this.cycle('colorIndex', this.colors.length, dir);
  }

  cycleCap(dir: number) {
    return this.cycle('capIndex', this.caps.length, dir);
  }

  /** Unlocks return false when there's nothing new (the pickup then stays). */
  addColor(c: PaintColor) {
    if (this.colors.includes(c)) return false;
    const cur = this.color;
    this.colors = COLOR_ORDER.filter((x) => x === c || this.colors.includes(x));
    this.colorIndex = this.colors.indexOf(cur);
    this.version++;
    return true;
  }

  addCap(id: CapId) {
    if (this.caps.includes(id)) return false;
    const cur = this.cap;
    this.caps = CAP_ORDER.filter((x) => x === id || this.caps.includes(x));
    this.capIndex = this.caps.indexOf(cur);
    this.version++;
    return true;
  }

  /** A tool found (a pickup); false if you already have it. */
  give(t: Tool) {
    if (this.has(t)) return false;
    this.found.add(t);
    this.version++;
    return true;
  }

  private cycle(key: 'colorIndex' | 'capIndex', n: number, dir: number) {
    if (n < 2) return false;
    this[key] = (this[key] + dir + n) % n;
    this.version++;
    return true;
  }
}
