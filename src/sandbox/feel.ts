import * as THREE from 'three';
import type { CapSpec } from '../config';
import type { DotShape } from '../paint-raster';
import type { Rect } from '../surfaces';

// R&D sandbox (exp/visual-sandbox): how spraying feels. Not for production.
//  - distance changes the dot's character: close = narrow, hard, heavy, runs;
//    far = wide, soft
//  - slant: a dot hitting the wall at an angle stretches into an ellipse along
//    the aim, fading at the far end
//  - fast aim thins the line (flicks taper)
//  - one crosshair for the can: the spot's real size, the opacity, too close
// The panel is sandbox/panel.ts (Z), the crosshair sandbox/aim.ts.

export const FEEL = {
  on: true,
  /** Under the crosshair: the distance to the wall, bright inside the gap. */
  showGap: false,
  /** The crosshair as wide as the line will be, as seen (else the dab's full reach, 12..40 px). */
  aimTrue: true,
  /** The can never loses pressure: no shaking. */
  endlessPressure: true,
  // Brush (sandbox/brush.ts): paint at once, as a continuous stroke
  brush: true,
  /** One pass of a stroke reaches about this opacity (Shift + wheel). */
  opacity: 0.65,
  /** Dab spacing, a fraction of the dab's radius. */
  spacing: 0.2,
  /** Aim smoothing (StreamLine), 0 = off. */
  streamline: 0.25,
  /** Held still, dabs per second that build the paint up (and make it run). */
  buildRate: 60,
  closeSoft: 0.3,
  /** Speed (m/s over the wall) up to which a line is as set; faster, it thins, widens and softens. */
  speedRef: 2.4,
  speedFade: 0.4,
  speedWiden: 0.7,
  speedSoft: 0.8,
  farSoft: 0.95,
  // Distance
  /** Up to this far from the wall (m) the spray acts as if close up: the near effects, the spread and the fade start past it. */
  gap: 0.6,
  closeAt: 0.25,
  farAt: 2.5,
  closeSize: 0.55,
  farSize: 2.2,
  closeFlow: 1.8,
  closeDrips: 4,
  /** Past the gap, the brush fades from this distance (m) on, down to `fadeMin` of its opacity at the can's reach. */
  fadeStart: 0.5,
  fadeMin: 0.75,
  // Slant
  slant: 1,
  maxElong: 4,
  tail: 0.7,
  // Gesture
  speedThin: 0.12,
};

/** The values the panel starts with, for its reset. */
export const DEFAULTS = { ...FEEL };

// --- Per particle ---

export interface Landing {
  /** Paint per particle, radius (m), softness, drips per m², shape. */
  amount: number;
  radius: number;
  softness: number;
  drips: number;
  shape: DotShape | undefined;
}

/** The distance the spray acts as if from: FEEL.gap less, so that far from the wall it's still as close up. */
export const sprayDistance = (distance: number) => Math.max(0.05, distance - FEEL.gap);

/** How far into the far range a hit at `distance` is: 0 close, 1 far. */
export const farness = (distance: number) => THREE.MathUtils.clamp((sprayDistance(distance) - FEEL.closeAt) / (FEEL.farAt - FEEL.closeAt), 0, 1);

/** Ellipse of a ray along `dir` meeting face `rect` (null: it has no plane). */
export function slantShape(rect: Rect | undefined, dir: THREE.Vector3, out: { elong: number; ang: number; cos: number }) {
  const f = rect?.face;
  if (!f) return null;
  const c = Math.abs(f.normal.dot(dir));
  const u = dir.dot(f.uAxis) / f.uAxis.length();
  const v = dir.dot(f.vAxis) / f.vAxis.length();
  out.cos = c;
  out.elong = 1 + (Math.min(FEEL.maxElong, 1 / Math.max(c, 0.05)) - 1) * FEEL.slant;
  out.ang = Math.atan2(v, u);
  return out;
}
const slant = { elong: 1, ang: 0, cos: 1 };

/** The paint one particle lands with, by distance and slant. `base`: the cap's amount for this particle. */
export function landing(cap: CapSpec, base: number, distance: number, rect: Rect | undefined, dir: THREE.Vector3, out: Landing) {
  const t = farness(distance);
  const s = slantShape(rect, dir, slant);
  out.amount = Math.min(1, base * THREE.MathUtils.lerp(FEEL.closeFlow, 1, t));
  out.radius = (cap.dotSize / 2) * THREE.MathUtils.lerp(FEEL.closeSize, FEEL.farSize, t);
  out.softness = THREE.MathUtils.lerp(Math.min(cap.softness, 0.1), Math.max(cap.softness, 0.6), t);
  out.drips = cap.drips * THREE.MathUtils.lerp(FEEL.closeDrips, 1, t);
  out.shape = s && FEEL.slant > 0 ? [s.elong, s.ang, FEEL.tail * (1 - s.cos)] : undefined;
  return out;
}
