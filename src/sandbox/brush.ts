import * as THREE from 'three';
import { SPRAY, type CapSpec } from '../config';
import type { PaintSystem, Rgb } from '../painting';
import type { DotShape } from '../paint-raster';
import type { SprayParticles } from '../spray/particles';
import { FEEL, farness, slantShape, sprayDistance } from './feel';

// R&D sandbox: the can as a drawing app's brush (Procreate-like). Paint lands
// at once where the aim meets the wall, as a continuous stroke: from the last
// frame's point to this one, dabs every `spacing` of the dab's size, each
// cast on its own, so a fast flick leaves no gaps and a stroke turns corners.
// Held still, it builds up (airbrush) and runs. One pass of a stroke reaches
// about FEEL.opacity (Shift + wheel). The aim is smoothed (FEEL.streamline).
// Particles only show the spray.

const MAX_DABS = 160;

const aimDir = new THREE.Vector3();
const smoothDir = new THREE.Vector3();
const lastPoint = new THREE.Vector3();
const curPoint = new THREE.Vector3();
const p = new THREE.Vector3();
const dir = new THREE.Vector3();
const slant = { elong: 1, ang: 0, cos: 1 };

export interface BrushParams {
  eye: THREE.Vector3;
  forward: THREE.Vector3;
  cap: CapSpec;
  rgb: Rgb;
  /** 0..1 flow from the can's pressure. */
  flow: number;
  dt: number;
}

/** Dab radius (m) at a distance: the cap's cone, plus its dot. */
export function dabRadius(cap: CapSpec, distance: number) {
  const t = farness(distance);
  distance = sprayDistance(distance);
  return distance * Math.tan(cap.spread / 2) * 0.8 + (cap.dotSize / 2) * THREE.MathUtils.lerp(FEEL.closeSize, FEEL.farSize, t);
}

/** How much faster than FEEL.speedRef the hand moves: 0 at it and below, toward 1 well above it. */
const speedEffect = (speed: number) => (FEEL.speedRef > 0 ? THREE.MathUtils.clamp((speed - FEEL.speedRef) / (FEEL.speedRef * 3), 0, 1) : 0);

export interface DabLook {
  radius: number;
  softness: number;
  /** About the opacity one pass of a stroke reaches along its middle. */
  pass: number;
}
const look: DabLook = { radius: 0, softness: 0, pass: 0 };

/** A dab at `distance`, the hand moving at `speed` (m/s over the wall): its size, its edge, one pass's opacity. */
export function dabLook(cap: CapSpec, distance: number, speed: number, flow = 1) {
  const t = farness(distance);
  const fast = speedEffect(speed);
  look.radius = dabRadius(cap, distance) * (1 + FEEL.speedWiden * fast);
  const sd = sprayDistance(distance);
  const fall = sd <= FEEL.fadeStart ? 1 : 1 - (sd - FEEL.fadeStart) / Math.max(0.1, SPRAY.reach - FEEL.fadeStart);
  // The cap's edge scales the brush's: soft caps fuzzier, hard caps crisp at any distance (standard = 0.35 = as set).
  look.softness = Math.min(1, THREE.MathUtils.lerp(FEEL.closeSoft, FEEL.farSoft, t) * (cap.softness / 0.35) + FEEL.speedSoft * fast);
  // One pass reaches about `pass` along the stroke's middle (opacity is what it says, like a drawing app;
  // distance only thins it a little). Above speedRef the paint per second holds: per meter of line it thins
  // as 1 / speed (speedFade 1), or less.
  const thin = speed > FEEL.speedRef && FEEL.speedRef > 0 ? Math.pow(FEEL.speedRef / speed, FEEL.speedFade) : 1;
  look.pass = Math.min(0.999, FEEL.opacity * flow * Math.max(FEEL.fadeMin, fall) * THREE.MathUtils.lerp(FEEL.closeFlow, 1, t) * thin);
  return look;
}

/**
 * Half the width of the line a stroke of such dabs leaves, as seen (m): out to
 * where it's half as dense as along its middle. A soft edge fades well inside
 * the dab's rim; a dense pass saturates and reaches further out.
 */
export function lineRadius(l: DabLook) {
  const s = l.softness;
  // Paint a texel `y` (dab radii) off the middle gets from the dabs passing it (dot falloff 1 - s d²).
  const across = (y: number) => {
    const half = Math.sqrt(1 - y * y);
    return 2 * half * (1 - s * y * y) - (2 / 3) * s * half ** 3;
  };
  const mid = across(0);
  const k = Math.log(1 - l.pass);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 12; i++) {
    const y = (lo + hi) / 2;
    if (1 - Math.exp((k * across(y)) / mid) >= 0.5 * l.pass) lo = y;
    else hi = y;
  }
  return l.radius * lo;
}

export class SprayBrush {
  private has = false;
  private idle = 0;
  /** How fast the spot moves over the wall (m/s), smoothed. */
  private speed = 0;
  private moved = false;
  private smoothed = false;

  constructor(
    private paint: PaintSystem,
    private caster: SprayParticles,
  ) {}

  /** The stroke ended (the button let go): the next one starts fresh. */
  end() {
    this.speed = 0;
    this.moved = false;
    this.has = false;
    this.smoothed = false;
  }

  /** How fast the spot moves over the wall (m/s); 0 between strokes. */
  get handSpeed() {
    return this.speed;
  }

  /** The aim as the brush follows it (smoothed): for the reticle too. */
  aim(forward: THREE.Vector3, dt: number) {
    if (!this.smoothed) {
      smoothDir.copy(forward);
      this.smoothed = true;
    } else {
      // StreamLine: the brush trails the aim; 0 = none.
      const k = FEEL.streamline <= 0 ? 1 : 1 - Math.exp(-dt / (FEEL.streamline * 0.08));
      smoothDir.lerp(forward, k).normalize();
    }
    return aimDir.copy(smoothDir);
  }

  stroke(b: BrushParams) {
    const forward = this.aim(b.forward, b.dt);
    const hit = this.caster.probe(b.eye, forward);
    if (!hit) {
      this.has = false;
      return false;
    }
    curPoint.copy(hit.point);
    const size = dabRadius(b.cap, hit.distance);
    const spacing = Math.max(size * FEEL.spacing, 0.003);
    const gap = this.has ? lastPoint.distanceTo(curPoint) : 0;
    // A can puts out the same paint per second: the faster the spot moves, the thinner, wider and softer the line.
    const v = this.has && gap < 3 ? gap / Math.max(b.dt, 1e-3) : 0;
    // The first move of a stroke sets the speed at once: smoothing it up from 0 made every start dense.
    this.speed = this.moved ? this.speed + (v - this.speed) * Math.min(1, b.dt * 15) : v;
    if (v > 0) this.moved = true;
    if (this.has && gap > spacing && gap < 3) {
      // Fill from the last point to this one: dabs along the way, each cast from the eye.
      const n = Math.min(MAX_DABS, Math.ceil(gap / spacing));
      for (let i = 1; i <= n; i++) {
        p.lerpVectors(lastPoint, curPoint, i / n);
        dir.subVectors(p, b.eye).normalize();
        this.dabAlong(b, dir, 1);
      }
      this.idle = 0;
      lastPoint.copy(curPoint);
    } else if (!this.has || gap >= 3) {
      this.dabAlong(b, forward, 1);
      lastPoint.copy(curPoint);
      this.idle = 0;
    } else {
      // Held still: build up, like an airbrush.
      this.idle += b.dt * FEEL.buildRate;
      while (this.idle >= 1) {
        this.idle -= 1;
        this.dabAlong(b, forward, 0.5);
      }
    }
    this.has = true;
    return true;
  }

  /** One dab where a ray along `d` meets paintable surface. `weight` scales its paint. */
  private dabAlong(b: BrushParams, d: THREE.Vector3, weight: number) {
    const hit = this.caster.probe(b.eye, d, false);
    if (!hit) return;
    const { radius, softness, pass } = dabLook(b.cap, hit.distance, this.speed, b.flow);
    // Each texel along the middle is under about 2 / spacing dabs, softened by their edge.
    const overlap = (2 / FEEL.spacing) * (1 - softness * 0.6);
    const amount = Math.min(1, (1 - Math.pow(1 - pass, 1 / overlap)) * weight);
    let shape: DotShape | undefined;
    const s = slantShape(hit.rect, d, slant);
    if (s && FEEL.slant > 0) shape = [s.elong, s.ang, FEEL.tail * (1 - s.cos)];
    // Caps run by the paint they lay: wetness 1 (0 never runs).
    const drips = b.cap.drips > 0 ? 1 : 0;
    this.paint.stamp(hit.surface, hit.at, radius, amount, b.rgb, softness, drips, false, shape);
  }
}
