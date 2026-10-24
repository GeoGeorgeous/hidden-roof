import { DRIPS } from './config';
import type { PaintSurface, PaintSystem, Rgb } from './painting';
import type { Rect } from './surfaces';
import type { DripOp } from './paint-ops';
import { rounded } from './op-wire';

// Paint runs. PaintSystem reports texels on vertical faces that get more paint
// than they can dry, once they're already opaque; a few of them start a run: a one-texel
// trickle that moves down the face rect (texel -y = world down on upright
// rects), slows down, and ends in a slightly heavier drop. Runs only write into
// the paint texture, so they cost nothing once they stop.
// Whoever painted decides a run (spawn) and records it as a drip op in meters
// (paint-ops.ts); the run itself starts from that op (run), the same way on
// every client and at every paint detail.

interface Run {
  s: PaintSurface;
  rect: Rect;
  x: number;
  y: number;
  end: number;
  length: number;
  speed: number;
  rgb: Rgb;
}

export class PaintDrips {
  private runs: Run[] = [];
  /** Dev tools only (dev/runs-view.ts): told each texel a run paints, null in play. */
  tap: ((s: PaintSurface, rect: Rect, x: number, y: number) => void) | null = null;

  constructor(private paint: PaintSystem) {
    paint.onDrip = (s, rect, x, y, rgb) => this.spawn(s, rect, x, y, rgb);
  }

  get count() {
    return this.runs.length;
  }

  /** A puddle of wet paint at texel (x, y) of a face we painted overflowed: start a run there (false if it can't now). */
  private spawn(s: PaintSurface, rect: Rect, x: number, y: number, rgb: Rgb) {
    if (this.runs.length >= DRIPS.maxActive) return false;
    // One run per column at a time, so a hot spot doesn't stack runs.
    if (this.runs.some((r) => r.s === s && r.x === x && Math.abs(r.y - y) < 4)) return false;
    // Length and speed by where it starts, not by chance: the same spot runs the same way.
    const u = (x + 0.5 - rect.x) / rect.w;
    const v = (y + 0.5 - rect.y) / rect.h;
    const length = DRIPS.minLength + spot(u, v, 1) * (DRIPS.maxLength - DRIPS.minLength);
    if (Math.max(rect.y, y - length * s.geo.texelsPerMeter) >= y - 1) return true;
    // As its op carries it (op-wire.ts), so every client runs the same run.
    const op = this.paint.record(rounded<DripOp>({ kind: 'drip', key: s.key, rect: s.geo.rects.indexOf(rect), u, v, length, speed: DRIPS.speed * (0.6 + 0.8 * spot(u, v, 2)), rgb }));
    this.run(s, op);
    return true;
  }

  /** Start a run (ours or from elsewhere, paint-ops.ts) at this client's paint detail. */
  run(s: PaintSurface, op: DripOp) {
    const tpm = s.geo.texelsPerMeter;
    const rect = s.geo.rects[op.rect];
    const x = rect.x + Math.floor(op.u * rect.w);
    const y = rect.y + Math.floor(op.v * rect.h);
    const end = Math.max(rect.y, y - op.length * tpm);
    if (end >= y - 1) return;
    this.runs.push({ s, rect, x, y: y + 0.5, end, length: y - end, speed: op.speed * tpm, rgb: op.rgb });
  }

  update(dt: number) {
    this.paint.tick(dt);
    const list = this.runs;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (this.paint.get(r.s.mesh) !== r.s) continue; // prop removed or rebuilt
      const left = Math.max(0, (r.y - r.end) / r.length);
      const row0 = Math.floor(r.y);
      // Viscous: slows down as it runs out of paint.
      r.y -= r.speed * (0.25 + 0.75 * left) * dt;
      const row1 = Math.max(Math.floor(r.y), Math.ceil(r.end));
      // Each row's paint by where it is in the run, not when a frame came: the same on every client.
      for (let row = row0 - 1; row >= row1; row--) this.lay(r, row, DRIPS.strength * (0.55 + 0.45 * Math.max(0, (row - r.end) / r.length)));
      if (r.y <= r.end + 1) {
        // The drop at the end.
        this.lay(r, row1, DRIPS.strength);
        continue;
      }
      list[n++] = r;
    }
    list.length = n;
  }

  private lay(r: Run, row: number, amount: number) {
    this.paint.dab(r.s, r.rect, r.x, row, amount, r.rgb);
    this.tap?.(r.s, r.rect, r.x, row);
  }

  clear() {
    this.runs.length = 0;
  }
}

/** 0..1, the same for the same face point (u, v) and salt: runs vary by place, never by chance. */
function spot(u: number, v: number, salt: number) {
  let h = Math.imul(Math.round(u * 65536) ^ Math.imul(Math.round(v * 65536), 0x27d4eb2d), 0x165667b1) ^ salt;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
