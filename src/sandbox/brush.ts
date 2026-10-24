import * as THREE from 'three';
import { SPRAY, type CapSpec } from '../config';
import { paintRandom } from '../lcg';
import type { PaintSystem, Rgb } from '../painting';
import type { DotShape } from '../paint-raster';
import type { SprayParticles } from '../spray/particles';
import { FEEL, farness, slantShape } from './feel';

// R&D sandbox: the can as a drawing app's brush (Procreate-like). Paint lands
// at once where the aim meets the wall, as a continuous stroke: from the last
// frame's point to this one, dabs every `spacing` of the dab's size, each
// cast on its own, so a fast flick leaves no gaps and a stroke turns corners.
// Held still, it builds up (airbrush) and runs. One pass of a stroke reaches
// about FEEL.opacity (Shift + wheel). The aim is smoothed (FEEL.streamline).
// Particles only show the spray.

const MAX_DABS = 160;
const BUILD_RATE = 40;

const aimDir = new THREE.Vector3();
const smoothDir = new THREE.Vector3();
const lastPoint = new THREE.Vector3();
const curPoint = new THREE.Vector3();
const p = new THREE.Vector3();
const dir = new THREE.Vector3();
const jitter = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const slant = { elong: 1, ang: 0, cos: 1 };

export interface BrushParams {
  eye: THREE.Vector3;
  forward: THREE.Vector3;
  cap: CapSpec;
  rgb: Rgb;
  /** 0..1 flow from the can's pressure, the release tail. */
  flow: number;
  /** Extra size and paint at the start of a press. */
  spit: number;
  /** Odds-ish of spatter drops this frame (low pressure, tail). */
  spatter: number;
  dt: number;
}

/** Dab radius (m) at a distance: the cap's cone, plus its dot. */
export function dabRadius(cap: CapSpec, distance: number) {
  const t = farness(distance);
  let r = distance * Math.tan(cap.spread / 2) * 0.8 + (cap.dotSize / 2) * THREE.MathUtils.lerp(FEEL.closeSize, FEEL.farSize, t);
  if (FEEL.nib === 'needle') r *= 0.4;
  if (FEEL.nib === 'chisel') r = (cap.dotSize / 2) * 0.45 + distance * Math.tan(cap.spread / 2) * 0.2;
  return r;
}

export class SprayBrush {
  private has = false;
  private idle = 0;
  /** How fast the spot moves over the wall (m/s), smoothed. */
  private speed = 0;
  /** This frame's speed effect: 0 at FEEL.speedRef and below, toward 1 well above it. */
  private fast = 0;
  private smoothed = false;

  constructor(
    private paint: PaintSystem,
    private caster: SprayParticles,
  ) {}

  /** The stroke ended (the button let go): the next one starts fresh. */
  end() {
    this.speed = 0;
    this.has = false;
    this.smoothed = false;
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
    const size = dabRadius(b.cap, hit.distance) * (1 + b.spit * 0.6);
    const spacing = Math.max(size * FEEL.spacing, 0.003);
    const gap = this.has ? lastPoint.distanceTo(curPoint) : 0;
    // A can puts out the same paint per second: the faster the spot moves, the thinner, wider and softer the line.
    const v = this.has && gap < 3 ? gap / Math.max(b.dt, 1e-3) : 0;
    this.speed += (v - this.speed) * Math.min(1, b.dt * 15);
    this.fast = FEEL.speedRef > 0 ? THREE.MathUtils.clamp((this.speed - FEEL.speedRef) / (FEEL.speedRef * 3), 0, 1) : 0;
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
      this.idle += b.dt * BUILD_RATE;
      while (this.idle >= 1) {
        this.idle -= 1;
        this.dabAlong(b, forward, 0.5);
      }
    }
    this.has = true;
    this.specks(b, forward, hit.distance);
    return true;
  }


  /** One dab where a ray along `d` meets paintable surface. `weight` scales its paint. */
  private dabAlong(b: BrushParams, d: THREE.Vector3, weight: number) {
    const hit = this.caster.probe(b.eye, d, false);
    if (!hit) return;
    const t = farness(hit.distance);
    const radius = dabRadius(b.cap, hit.distance) * (1 + b.spit * 0.6) * (1 + FEEL.speedWiden * this.fast);
    const fall = hit.distance <= SPRAY.falloffStart ? 1 : 1 - (hit.distance - SPRAY.falloffStart) / (SPRAY.reach - SPRAY.falloffStart);
    // The cap's edge scales the brush's: soft caps fuzzier, hard caps crisp at any distance (standard = 0.35 = as set).
    const softness = FEEL.nib === 'round' ? Math.min(1, THREE.MathUtils.lerp(FEEL.closeSoft, FEEL.farSoft, t) * (b.cap.softness / 0.35) + FEEL.speedSoft * this.fast) : 0.1;
    // One pass reaches about `pass` along the stroke's middle (opacity is what it says, like a drawing app;
    // distance only thins it a little): each texel there is under about 2 / spacing dabs, softened by their edge.
    // Above speedRef the paint per second holds: per meter of line it thins as 1 / speed (speedFade 1), or less.
    const thin = this.speed > FEEL.speedRef && FEEL.speedRef > 0 ? Math.pow(FEEL.speedRef / this.speed, FEEL.speedFade) : 1;
    const pass = Math.min(0.999, FEEL.opacity * b.flow * Math.max(0.75, fall) * THREE.MathUtils.lerp(FEEL.closeFlow, 1, t) * (1 + b.spit) * thin);
    const overlap = (2 / FEEL.spacing) * (1 - softness * 0.6);
    const amount = Math.min(1, (1 - Math.pow(1 - pass, 1 / overlap)) * weight);
    let shape: DotShape | undefined;
    const s = slantShape(hit.rect, d, slant);
    if (s && FEEL.slant > 0) shape = [s.elong, s.ang, FEEL.tail * (1 - s.cos)];
    if (FEEL.nib === 'chisel' && hit.rect?.face) shape = [FEEL.chiselRatio * (s ? Math.sqrt(s.elong) : 1), (FEEL.chiselAngle * Math.PI) / 180, 0];
    const drips = b.cap.drips * THREE.MathUtils.lerp(FEEL.closeDrips, 1, t) * (1 + b.spit * 3);
    this.paint.stamp(hit.surface, hit.at, radius, amount, b.rgb, softness, drips, false, shape);
  }

  /** Overspray specks and spatter drops around the aim, landing at once. */
  private specks(b: BrushParams, forward: THREE.Vector3, distance: number) {
    const t = farness(distance);
    const count = FEEL.overspray * 12 * b.flow * b.dt * 60 * (0.3 + t);
    const drops = (FEEL.spatter * t + b.spatter) * b.dt * 60;
    right.crossVectors(forward, THREE.Object3D.DEFAULT_UP).normalize();
    up.crossVectors(right, forward);
    const n = Math.floor(count + paintRandom.spray());
    const m = Math.floor(drops + paintRandom.spray());
    for (let i = 0; i < n + m; i++) {
      const drop = i >= n;
      const cone = b.cap.spread * (drop ? 1.5 : FEEL.oversprayCone) * 0.5;
      const r = Math.tan(cone * Math.sqrt(paintRandom.spray()));
      const a = paintRandom.spray() * Math.PI * 2;
      jitter.copy(forward).addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      const hit = this.caster.probe(b.eye, jitter, false);
      if (!hit) continue;
      const radius = drop ? (b.cap.dotSize / 2) * FEEL.spatterSize * (0.4 + paintRandom.spray() * 1.2) : 0.002 + paintRandom.spray() * 0.004;
      const amount = drop ? 0.95 : (0.4 + paintRandom.spray() * 0.4) * FEEL.opacity;
      this.paint.stamp(hit.surface, hit.at, radius, amount, b.rgb, drop ? 0.05 : 0, drop ? b.cap.drips * 2 : 0);
    }
  }
}
