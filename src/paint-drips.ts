import { DRIPS, PAINT } from './config';
import type { PaintSurface, PaintSystem, Rgb } from './painting';
import type { Rect } from './surfaces';

// Paint runs. PaintSystem reports texels on vertical faces that keep getting
// sprayed after they're already opaque; a few of them start a run: a one-texel
// trickle that moves down the face rect (texel -y = world down on upright
// rects), slows down, and ends in a slightly heavier drop. Runs only write into
// the paint texture, so they cost nothing once they stop.

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

  private spawn(s: PaintSurface, rect: Rect, x: number, y: number, rgb: Rgb) {
    if (this.runs.length >= DRIPS.maxActive) return;
    // One run per column at a time, so a hot spot doesn't stack runs.
    if (this.runs.some((r) => r.s === s && r.x === x && Math.abs(r.y - y) < 4)) return;
    const tpm = PAINT.texelsPerMeter;
    const length = (DRIPS.minLength + Math.random() * (DRIPS.maxLength - DRIPS.minLength)) * tpm;
    const end = Math.max(rect.y, y - length);
    if (end >= y - 1) return;
    this.runs.push({ s, rect, x, y: y + 0.5, end, length: y - end, speed: DRIPS.speed * tpm * (0.6 + 0.8 * Math.random()), rgb });
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
