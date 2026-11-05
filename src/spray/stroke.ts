import * as THREE from 'three';
import { BRUSH, type CapSpec } from '../config';
import { dabAt, dabSpacing, type Dab } from './dab';

// A stroke of the can: where its dabs go. Each frame the aim (smoothed) meets
// the wall, and from the stroke's last dab to there dabs are laid a spacing
// apart as the eye sees it (across), what's left over carried to the next frame,
// so a line gets as many dabs at any frame rate. Each is cast from the eye on its
// own, so a fast flick has no gaps and turns corners. Held still, dabs build up at a set
// rate, like an airbrush. It knows the wall and the paint only through `Wall`
// and `Canvas`, so its logic runs without a browser (scripts/brush.test.mjs).

export interface WallHit {
  point: THREE.Vector3;
  /** From the ray's start (m). */
  distance: number;
}

/** Finds paintable wall along a ray. */
export interface Wall<H extends WallHit> {
  find(from: THREE.Vector3, along: THREE.Vector3): H | null;
}

export interface Canvas<H extends WallHit> {
  lay(hit: H, dab: Dab): void;
}

/** One frame of spraying. */
export interface StrokeFrame {
  eye: THREE.Vector3;
  forward: THREE.Vector3;
  cap: CapSpec;
  dt: number;
}

const step = new THREE.Vector3();
const along = new THREE.Vector3();
const ray = new THREE.Vector3();
const dab: Dab = { radius: 0, softness: 0, amount: 0 };

/**
 * How far `b` is from `a` as `eye` sees it: the way across the ray between them.
 * Along a wall seen at an angle a dab is as much longer as this is shorter, so
 * it's the same share of a dab's length in any direction; a wall behind another's
 * edge is no way at all.
 */
function across(a: THREE.Vector3, b: THREE.Vector3, eye: THREE.Vector3) {
  ray.addVectors(a, b).multiplyScalar(0.5).sub(eye).normalize();
  step.subVectors(b, a);
  return step.addScaledVector(ray, -step.dot(ray)).length();
}

/** The share of the hand's pace the aim, behind the streamline, has `t` seconds after setting off. */
const gettingGoing = (t: number) => 1 - Math.exp(-t / BRUSH.streamline);

export class SprayStroke<H extends WallHit> {
  /** How fast the spot moves as the eye sees it (m/s, `across`), smoothed; 0 between strokes. */
  speed = 0;
  /** How far the wall under the aim was (m) this frame; null: none. */
  distance: number | null = null;
  private aim = new THREE.Vector3();
  private aiming = false;
  /** Where the aim met the wall last frame, and the stroke's last dab. */
  private spot = new THREE.Vector3();
  private lastDab = new THREE.Vector3();
  private onWall = false;
  /** How long the stroke has moved (s). */
  private startTime = 0;
  /** Dabs owed by the clock: the can lays at least BRUSH.buildRate a second, those of the line counting, so slow lines come out alike at any frame rate. */
  private owed = 0;

  constructor(
    private wall: Wall<H>,
    private canvas: Canvas<H>,
  ) {}

  /** The spray stopped: the next one starts fresh. */
  end() {
    this.speed = 0;
    this.startTime = 0;
    this.onWall = false;
    this.aiming = false;
  }

  /** Lays this frame's dabs; returns whether the aim is on paintable wall. */
  update(f: StrokeFrame) {
    const hit = this.wall.find(f.eye, this.smoothed(f));
    this.distance = hit?.distance ?? null;
    if (!hit) {
      this.onWall = false;
      return false;
    }
    const moved = across(this.spot, hit.point, f.eye);
    const fresh = !this.onWall || this.spot.distanceTo(hit.point) >= BRUSH.maxJump;
    this.follow(fresh ? 0 : moved, f.dt);
    this.spot.copy(hit.point);
    this.onWall = true;
    const spacing = dabSpacing(f.cap, hit.distance);
    this.owed += f.dt * BRUSH.buildRate;
    if (fresh) {
      this.lastDab.copy(hit.point);
      this.owed = 0;
      this.lay(f, hit, 1);
    } else if (across(this.lastDab, hit.point, f.eye) >= spacing) {
      this.owed = Math.max(this.owed - this.fill(f, spacing), -1);
    }
    for (; this.owed >= 1; this.owed--) this.lay(f, hit, BRUSH.buildAmount);
    return true;
  }

  /** The aim as the brush follows it: it trails the real one, which takes the mouse's jitter out of lines. */
  private smoothed(f: StrokeFrame) {
    if (!this.aiming) this.aim.copy(f.forward);
    else this.aim.lerp(f.forward, BRUSH.streamline > 0 ? 1 - Math.exp(-f.dt / BRUSH.streamline) : 1).normalize();
    this.aiming = true;
    return this.aim;
  }

  /** A stroke's first BRUSH.speedStart of moving takes the pace as it is, later ones smooth it: smoothed up from 0, every stroke would start dense. A frame running past that time takes the pace the aim had then, so a stroke starts alike at any frame rate. */
  private follow(way: number, dt: number) {
    if (way === 0 && this.startTime === 0) return;
    const pace = way / Math.max(dt, 1e-3);
    this.startTime += dt;
    const past = Math.min(this.startTime - BRUSH.speedStart, dt);
    if (past < dt) this.speed = past > 0 ? (pace * gettingGoing(BRUSH.speedStart)) / gettingGoing(this.startTime) : pace;
    if (past > 0) this.speed += (pace - this.speed) * (1 - Math.exp(-past * BRUSH.speedFollow));
  }

  /** Dabs from the last one toward the spot, `spacing` apart; returns how many. */
  private fill(f: StrokeFrame, spacing: number) {
    const gap = across(this.lastDab, this.spot, f.eye);
    const n = Math.min(BRUSH.maxDabs, Math.floor(gap / spacing));
    // Past maxDabs they spread out to reach the spot, so a line can't fall behind the aim.
    step.subVectors(this.spot, this.lastDab).multiplyScalar((n === BRUSH.maxDabs ? gap / n : spacing) / gap);
    for (let i = 0; i < n; i++) {
      this.lastDab.add(step);
      const hit = this.wall.find(f.eye, along.subVectors(this.lastDab, f.eye).normalize());
      if (hit) this.lay(f, hit, 1);
    }
    return n;
  }

  private lay(f: StrokeFrame, hit: H, weight: number) {
    dabAt(f.cap, hit.distance, this.speed, dab).amount *= weight;
    this.canvas.lay(hit, dab);
  }
}
