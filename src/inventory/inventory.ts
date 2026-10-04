import { CAP_ORDER, COLOR_ORDER, type CapId, type PaintColor } from '../config';

// Three slots: 1 = the spray can (always), 2 = the marker, 3 = the stepladder
// (each once found).
// Colors and caps are permanent unlocks (colors shared by both tools).
// Paint never runs out; the can only has pressure.

export type Tool = 'can' | 'marker' | 'ladder';
export const SLOTS: Tool[] = ['can', 'marker', 'ladder'];

export class Inventory {
  selected = 0;
  hasMarker = false;
  hasLadder = false;
  colors: PaintColor[] = [];
  caps: CapId[] = [];
  /** Can pressure 0..1: drains while spraying, restored by shaking. */
  pressure = 1;
  /** Bumped on every change so the HUD can skip redundant DOM updates. */
  version = 0;
  private colorIndex = 0;
  private capIndex = 0;

  constructor() {
    this.reset();
  }

  /** Starting kit: the can, black, standard cap, no marker, no ladder. */
  reset() {
    this.selected = 0;
    this.hasMarker = false;
    this.hasLadder = false;
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
    return (t === 'marker' && !this.hasMarker) || (t === 'ladder' && !this.hasLadder) ? null : t;
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

  giveMarker() {
    if (this.hasMarker) return false;
    this.hasMarker = true;
    this.version++;
    return true;
  }

  giveLadder() {
    if (this.hasLadder) return false;
    this.hasLadder = true;
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
