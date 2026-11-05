import { DRIPS } from './config';
import { paintRandom } from './lcg';

// Wet paint: what may start a paint run. Paint landing on opaque paint is wet,
// and each texel keeps when its wet paint is dry: one number, so nothing runs
// per frame. Past DRIPS.passes a texel may run. Pure numbers, so Node tests it
// (scripts/paint-wet.test.mjs).

/** What wet paint needs of a surface. */
export interface WetSurface {
  geo: { atlasW: number; atlasH: number; texelsPerMeter: number };
  /** Per texel, the paint clock time (WetPaint.now) at which its wet paint on already-opaque paint is dry (created on first wet paint). */
  wet: Float32Array | null;
}

export class WetPaint {
  /** The paint clock (s), advanced by the game's frame time (PaintSystem.tick): wet paint dries by it. */
  now = 0;

  /** `amt` coats more on opaque texel (x, y); `rate`: how often it runs, per m² of paint past the build-up. Returns whether a run starts here. */
  add(s: WetSurface, x: number, y: number, amt: number, rate: number) {
    const wet = (s.wet ??= new Float32Array(s.geo.atlasW * s.geo.atlasH));
    const k = y * s.geo.atlasW + x;
    const until = Math.max(wet[k], this.now) + (amt / DRIPS.passCoats) * DRIPS.dryTime;
    if (until - this.now < DRIPS.passes * DRIPS.dryTime) {
      wet[k] = until;
      return false;
    }
    wet[k] = this.now;
    return paintRandom.drips() < rate / s.geo.texelsPerMeter ** 2;
  }
}
