import { BRUSH, SPRAY, type CapSpec } from '../config';

// How a cap's plume looks, from what makes its line: a wide cap's cone is wide
// and its specks big, a soft one's spread into a haze, a flat nib's is a fan.
// Pure numbers, so Node tests it (scripts/brush.test.mjs). Each cap's own
// `plume` scales the result (F3).

export interface PlumeLook {
  /** The cone's full angle (radians) on its narrow side. */
  cone: number;
  /** How many times wider the other way: a flat fan. */
  fan: number;
  /** The fan's angle on the screen (radians). */
  angle: number;
  /** A speck's size at the nozzle (m), and how many times it grows by its end. */
  size: number;
  grow: number;
}

export function plumeLook(cap: CapSpec, out: PlumeLook) {
  const p = SPRAY.plume;
  out.cone = (cap.spread + cap.dotSize / 2) * p.cone * cap.plume.cone;
  out.fan = cap.nib?.stretch ?? 1;
  out.angle = ((cap.nib?.angle ?? 0) * Math.PI) / 180;
  out.size = p.size * Math.sqrt(cap.dotSize / p.dotAtPar) * cap.plume.size;
  out.grow = Math.max(1, p.grow * (1 + cap.softness - BRUSH.softnessRef) * cap.plume.grow);
  return out;
}
