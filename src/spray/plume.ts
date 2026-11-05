import { BRUSH, SPRAY, type CapSpec } from '../config';

// How a cap's plume looks, from what makes its line: a wide cap's cone is wide
// and its specks big, a soft one's spread into a haze. How much comes out of
// the can makes it thicker or thinner.
// Pure numbers, so Node tests it (scripts/brush.test.mjs). Each cap's own
// `plume` scales the result (F3).

export interface PlumeLook {
  /** The cone's full angle (radians). */
  cone: number;
  /** A speck's size at the nozzle (m), and how many times it grows by its end. */
  size: number;
  grow: number;
}

/** Specks' number and strength for a can's flow (SprayTool.flow), each against SPRAY.plume.opacityAtPar: together they follow the opacity set. */
export const plumeStrength = (flow: number) => Math.sqrt(flow / SPRAY.plume.opacityAtPar);

export function plumeLook(cap: CapSpec, out: PlumeLook) {
  const p = SPRAY.plume;
  out.cone = (cap.spread + cap.dotSize / 2) * p.cone * cap.plume.cone;
  // Kept for a flat nib on the marker, a later version. A flat fan: out.fan = cap.nib?.stretch ?? 1; out.angle = its angle in radians.
  out.size = p.size * Math.sqrt(cap.dotSize / p.dotAtPar) * cap.plume.size;
  out.grow = Math.max(1, p.grow * (1 + cap.softness - BRUSH.softnessRef) * cap.plume.grow);
  return out;
}
