import { MathUtils, type Vector3 } from 'three';
import { BRUSH, SPRAY, type CapSpec } from '../config';
import type { Slant } from '../paint-ops';
import type { Rect } from '../surfaces';

// One dab of the can's brush, from what makes a real can's line: the cap, how
// far the wall is and how fast the hand moves. Pure numbers, so Node tests it
// (scripts/brush.test.mjs), and the one place that sizes a dab.

export interface Dab {
  /** Meters, as PaintSystem.stamp takes it. */
  radius: number;
  /** 0 = hard edge, 1 = fades to nothing at the rim. */
  softness: number;
  /** Opacity at its middle. */
  amount: number;
}

/** The distance the spray acts as if from: inside BRUSH.gap the can is as close up. */
const sprayDistance = (distance: number) => Math.max(BRUSH.minDistance, distance - BRUSH.gap);

/** How far into the far range a wall at `distance` is: 0 close, 1 far. */
const farness = (distance: number) => MathUtils.clamp((sprayDistance(distance) - BRUSH.closeAt) / (BRUSH.farAt - BRUSH.closeAt), 0, 1);

/** How far above BRUSH.speedRef the hand is: 0 at it and below, 1 at four times it and above. */
const fastness = (speed: number) => (BRUSH.speedRef > 0 ? MathUtils.clamp((speed - BRUSH.speedRef) / (BRUSH.speedRef * 3), 0, 1) : 0);

/** A dab's width (m) with the hand at rest: the cap's cone at this distance, plus its dot. */
function restWidth(cap: CapSpec, distance: number) {
  const cone = 2 * sprayDistance(distance) * Math.tan(cap.spread / 2) * BRUSH.coneShare;
  return cone + cap.dotSize * MathUtils.lerp(BRUSH.closeSize, BRUSH.farSize, farness(distance));
}

/** How far apart (m) a stroke lays its dabs on a wall at `distance`. */
export function dabSpacing(cap: CapSpec, distance: number) {
  return Math.max(restWidth(cap, distance) * BRUSH.spacing, BRUSH.minSpacing);
}

const widest: Dab = { radius: 0, softness: 0, amount: 0 };

/**
 * The width (m) of the line a stroke leaves: out to where it's half as dense as along its middle, so a soft edge
 * reads narrower than a dab's reach. At `y` from the middle, a line of dabs adds up to 1 - exp(-paint over the chord).
 */
export function lineWidth(cap: CapSpec, distance: number, speed: number) {
  const { radius: r, softness: s, amount } = dabAt(cap, distance, speed, widest);
  const perMeter = -Math.log(1 - amount) / dabSpacing(cap, distance);
  const density = (y: number) => {
    const half = Math.sqrt(r * r - y * y);
    return 1 - Math.exp(-perMeter * 2 * half * (1 - (s * (half * half / 3 + y * y)) / (r * r)));
  };
  const target = density(0) / 2;
  let inside = 0;
  let outside = r;
  for (let i = 0; i < 12; i++) {
    const y = (inside + outside) / 2;
    if (density(y) > target) inside = y;
    else outside = y;
  }
  return inside + outside;
}

/** How a ray along `ray` (unit) lands on `face`: the far end is where the ray goes on to. None: head on, or a curved face. */
export function slantOf(face: Rect['face'], ray: Vector3): Slant | undefined {
  if (!face) return undefined;
  const cos = Math.abs(face.normal.dot(ray));
  const stretch = 1 / Math.max(cos, 1 / BRUSH.slantMax);
  if (stretch < BRUSH.slantFrom) return undefined;
  const turn = Math.atan2(ray.dot(face.vAxis) / face.vAxis.length(), ray.dot(face.uAxis) / face.uAxis.length()) / (Math.PI * 2);
  return { stretch, turn, tail: BRUSH.slantTail * (1 - cos) };
}

/** A dab's opacity once `slant` has spread it (BRUSH.slantThin). */
export const thinned = (amount: number, slant?: Slant) => (slant ? 1 - (1 - amount) ** (slant.stretch ** -BRUSH.slantThin) : amount);

/** The set opacity a step up (+1) or down (-1), in whole percents, so it comes back to the same numbers. */
export const stepOpacity = (opacity: number, dir: number) => Math.round(MathUtils.clamp(opacity + dir * BRUSH.opacityStep, BRUSH.opacityMin, BRUSH.opacityMax) * 100) / 100;

/** The opacity one pass of a stroke reaches along its middle: the set one, a little less far away, more close up, and thinned as a hand above BRUSH.speedRef spreads the same paint per second over more line. */
function passOpacity(distance: number, speed: number) {
  const past = sprayDistance(distance) - BRUSH.fadeStart;
  const fade = Math.max(BRUSH.fadeMin, past <= 0 ? 1 : 1 - past / (SPRAY.reach - BRUSH.fadeStart));
  const thin = speed > BRUSH.speedRef && BRUSH.speedRef > 0 ? (BRUSH.speedRef / speed) ** BRUSH.speedFade : 1;
  return Math.min(0.999, BRUSH.opacity * fade * MathUtils.lerp(BRUSH.closeFlow, 1, farness(distance)) * thin);
}

/** The dab a can lays into `out`: a wall at `distance`, the hand at `speed` (m/s over the wall). */
export function dabAt(cap: CapSpec, distance: number, speed: number, out: Dab) {
  const fast = fastness(speed);
  const width = restWidth(cap, distance);
  out.radius = (width / 2) * (1 + BRUSH.speedWiden * fast);
  // The cap's edge scales the brush's, so caps feel different at any distance.
  const edge = MathUtils.lerp(BRUSH.closeSoft, BRUSH.farSoft, farness(distance)) * (cap.softness / BRUSH.softnessRef);
  out.softness = Math.min(1, edge + BRUSH.speedSoft * fast);
  // A texel along the middle is under width / spacing dabs, and a dab's falloff (1 - s d²/r²) means 1 - s / 3 across it: each lays what adds up to one pass.
  const overlap = Math.max(1, (width / dabSpacing(cap, distance)) * (1 - out.softness / 3));
  out.amount = 1 - (1 - passOpacity(distance, speed)) ** (1 / overlap);
  return out;
}
