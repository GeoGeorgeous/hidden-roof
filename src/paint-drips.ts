import { DRIPS, PAINT } from './config';
import type { PaintSurface, PaintSystem, Rgb } from './painting';
import type { Rect } from './surfaces';
import type { DripOp } from './paint-ops';
import { paintRandom } from './lcg';

// Paint runs. PaintSystem reports texels on vertical faces that keep getting
// sprayed after they're already opaque; a few of them start a run: a one-texel
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

  constructor(private paint: PaintSystem) {
    paint.onDrip = (s, rect, x, y, rgb) => this.spawn(s, rect, x, y, rgb);
  }

  get count() {
    return this.runs.length;
  }

  /** Heavy paint at texel (x, y) of a face we painted: maybe start a run there. */
  private spawn(s: PaintSurface, rect: Rect, x: number, y: number, rgb: Rgb) {
    if (this.runs.length >= DRIPS.maxActive) return;
    // One run per column at a time, so a hot spot doesn't stack runs.
    if (this.runs.some((r) => r.s === s && r.x === x && Math.abs(r.y - y) < 4)) return;
    const length = DRIPS.minLength + paintRandom() * (DRIPS.maxLength - DRIPS.minLength);
    if (Math.max(rect.y, y - length * PAINT.texelsPerMeter) >= y - 1) return;
    const op: DripOp = { kind: 'drip', key: s.key, rect: s.geo.rects.indexOf(rect), u: (x + 0.5 - rect.x) / rect.w, v: (y + 0.5 - rect.y) / rect.h, length, speed: DRIPS.speed * (0.6 + 0.8 * paintRandom()), rgb };
    this.paint.log?.push(op);
    this.run(s, op);
  }

  /** Start a run (ours or from elsewhere, paint-ops.ts) at this client's paint detail. */
  run(s: PaintSurface, op: DripOp) {
    const tpm = PAINT.texelsPerMeter;
    const rect = s.geo.rects[op.rect];
    const x = rect.x + Math.floor(op.u * rect.w);
    const y = rect.y + Math.floor(op.v * rect.h);
    const end = Math.max(rect.y, y - op.length * tpm);
    if (end >= y - 1) return;
    this.runs.push({ s, rect, x, y: y + 0.5, end, length: y - end, speed: op.speed * tpm, rgb: op.rgb });
  }

  update(dt: number) {
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
      for (let row = row0 - 1; row >= row1; row--) this.paint.dab(r.s, r.rect, r.x, row, DRIPS.strength * (0.55 + 0.45 * left), r.rgb);
      if (r.y <= r.end + 1) {
        // The drop at the end.
        this.paint.dab(r.s, r.rect, r.x, row1, DRIPS.strength, r.rgb);
        continue;
      }
      list[n++] = r;
    }
    list.length = n;
  }

  clear() {
    this.runs.length = 0;
  }
}
