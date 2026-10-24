import * as THREE from 'three';
import type { CapSpec } from '../config';
import type { DotShape } from '../paint-raster';
import type { Rect } from '../surfaces';

// R&D sandbox (exp/visual-sandbox): how spraying feels. Not for production.
//  - distance changes the dot's character: close = narrow, hard, heavy, runs;
//    far = wide, soft, speckled
//  - overspray: a halo of faint fine dust around every line
//  - spatter: big hard droplets, more of them far away, at low pressure, at the
//    start of a press (spit) and as it's let go (tail)
//  - slant: a dot hitting the wall at an angle stretches into an ellipse along
//    the aim, fading at the far end
//  - nibs: round (the cap as is), chisel (a 45° calligraphy nib), needle
//  - fast aim thins the line (flicks taper)
//  - one crosshair for the can: the spot's real size, the opacity, too close
// The panel is sandbox/panel.ts (Z), the crosshair sandbox/aim.ts.

export const NIBS = ['round', 'chisel', 'needle'] as const;
export type Nib = (typeof NIBS)[number];

export const FEEL = {
  on: true,
  /** Under the crosshair: the distance to the wall, bright inside the gap. */
  showGap: false,
  /** The can never loses pressure: no shaking. */
  endlessPressure: true,
  nib: 'round' as Nib,
  // Brush (sandbox/brush.ts): paint at once, as a continuous stroke
  brush: true,
  /** One pass of a stroke reaches about this opacity (Shift + wheel). */
  opacity: 0.9,
  /** Dab spacing, a fraction of the dab's radius. */
  spacing: 0.2,
  /** Aim smoothing (StreamLine), 0 = off. */
  streamline: 0.25,
  /** Held still, dabs per second that build the paint up (and make it run). */
  buildRate: 40,
  closeSoft: 0.3,
  /** Speed (m/s over the wall) up to which a line is as set; faster, it thins, widens and softens. */
  speedRef: 0.8,
  speedFade: 0.8,
  speedWiden: 0.7,
  speedSoft: 0.4,
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
  // Overspray
  overspray: 0,
  oversprayCone: 3.5,
  oversprayAmount: 0.12,
  // Spatter
  spatter: 0,
  spatterLowPressure: 0,
  spatterSize: 0.7,
  spit: 0,
  spitTime: 0.09,
  releaseTail: 0.14,
  // Slant
  slant: 1,
  maxElong: 4,
  tail: 0.7,
  // Chisel
  chiselRatio: 7,
  chiselAngle: 45,
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

export type ParticleKind = 'paint' | 'overspray' | 'spatter';

/** The paint one particle lands with, by kind, distance and slant. `base`: the cap's amount for this particle. */
export function landing(kind: ParticleKind, cap: CapSpec, base: number, distance: number, rect: Rect | undefined, dir: THREE.Vector3, rnd: () => number, out: Landing) {
  const t = farness(distance);
  let radius = (cap.dotSize / 2) * THREE.MathUtils.lerp(FEEL.closeSize, FEEL.farSize, t);
  let softness = THREE.MathUtils.lerp(Math.min(cap.softness, 0.1), Math.max(cap.softness, 0.6), t);
  let amount = base * THREE.MathUtils.lerp(FEEL.closeFlow, 1, t);
  let drips = cap.drips * THREE.MathUtils.lerp(FEEL.closeDrips, 1, t);
  if (FEEL.nib === 'needle') {
    radius *= 0.4;
    softness = 0.05;
    amount = Math.min(1, amount * 1.4);
  }
  let shape: DotShape | undefined;
  const s = slantShape(rect, dir, slant);
  if (s && FEEL.slant > 0) shape = [s.elong, s.ang, FEEL.tail * (1 - s.cos)];
  if (FEEL.nib === 'chisel' && rect?.face) {
    // A flat nib held at a fixed angle on the wall: its width depends on the stroke's direction.
    shape = [FEEL.chiselRatio * (s ? Math.sqrt(s.elong) : 1), (FEEL.chiselAngle * Math.PI) / 180, 0];
    radius = (cap.dotSize / 2) * 0.45;
    softness = 0.08;
  }
  if (kind === 'overspray') {
    // Overspray is single specks of paint, a texel or two, not a haze.
    radius = 0.002 + rnd() * 0.004;
    amount = rnd() < FEEL.oversprayAmount * 4 ? 0.5 + rnd() * 0.4 : 0;
    softness = 0;
    drips = 0;
    shape = undefined;
  } else if (kind === 'spatter') {
    radius = (cap.dotSize / 2) * FEEL.spatterSize * (0.4 + rnd() * 1.2);
    amount = 0.95;
    softness = 0.05;
    drips = cap.drips * 2;
    // A drop at a slant still splats long.
    if (s) shape = [Math.sqrt(s.elong) * (1 + rnd()), s.ang, 0.3];
  }
  out.amount = Math.min(1, amount);
  out.radius = radius;
  out.softness = softness;
  out.drips = drips;
  out.shape = shape;
  return out;
}
