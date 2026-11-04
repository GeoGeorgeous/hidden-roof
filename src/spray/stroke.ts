import * as THREE from 'three';
import { BRUSH, type CapSpec } from '../config';
import { dabAt, dabSpacing, type Dab } from './dab';

// A stroke of the can: where its dabs go. Each frame the aim (smoothed) meets
// the wall, and from the stroke's last dab to there dabs are laid a spacing
// apart, what's left over carried to the next frame, so a line gets as many
// dabs per meter at any frame rate. Each is cast from the eye on its own, so a
// fast flick has no gaps and turns corners. Held still, dabs build up at a set
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
const dab: Dab = { radius: 0, softness: 0, amount: 0 };

export class SprayStroke<H extends WallHit> {
  /** How fast the spot moves over the wall (m/s), smoothed; 0 between strokes. */
  speed = 0;
  private aim = new THREE.Vector3();
  private aiming = false;
  /** Where the aim met the wall last frame, and the stroke's last dab. */
  private spot = new THREE.Vector3();
  private lastDab = new THREE.Vector3();
  private onWall = false;
  private moved = false;
  /** Dabs owed by the clock: the can lays at least BRUSH.buildRate a second, those of the line counting, so slow lines come out alike at any frame rate. */
  private owed = 0;

  constructor(
    private wall: Wall<H>,
    private canvas: Canvas<H>,
  ) {}

  /** The spray stopped: the next one starts fresh. */
  end() {
    this.speed = 0;
    this.moved = false;
    this.onWall = false;
    this.aiming = false;
  }

  /** Lays this frame's dabs; returns whether the aim is on paintable wall. */
  update(f: StrokeFrame) {
    const hit = this.wall.find(f.eye, this.smoothed(f));
    if (!hit) {
      this.onWall = false;
      return false;
    }
    const moved = this.spot.distanceTo(hit.point);
    const fresh = !this.onWall || moved >= BRUSH.maxJump;
    this.follow(fresh ? 0 : moved / Math.max(f.dt, 1e-3), f.dt);
    this.spot.copy(hit.point);
    this.onWall = true;
    const spacing = dabSpacing(f.cap, hit.distance);
    this.owed += f.dt * BRUSH.buildRate;
    if (fresh) {
      this.lastDab.copy(hit.point);
      this.owed = 0;
      this.lay(f, hit, 1);
    } else if (this.lastDab.distanceTo(hit.point) >= spacing) {
      this.owed = Math.max(-1, this.owed - this.fill(f, spacing));
    } else {
      for (; this.owed >= 1; this.owed--) this.lay(f, hit, BRUSH.buildAmount);
    }
    return true;
  }

  /** The aim as the brush follows it: it trails the real one, which takes the mouse's jitter out of lines. */
  private smoothed(f: StrokeFrame) {
    if (!this.aiming) this.aim.copy(f.forward);
    else this.aim.lerp(f.forward, BRUSH.streamline > 0 ? 1 - Math.exp(-f.dt / BRUSH.streamline) : 1).normalize();
    this.aiming = true;
    return this.aim;
  }

  /** The first move of a stroke sets the speed at once: smoothed up from 0, every stroke would start dense. */
  private follow(v: number, dt: number) {
    this.speed = this.moved ? this.speed + (v - this.speed) * (1 - Math.exp(-dt * BRUSH.speedFollow)) : v;
    if (v > 0) this.moved = true;
  }

  /** Dabs from the last one toward the spot, `spacing` apart; returns how many. */
  private fill(f: StrokeFrame, spacing: number) {
    const gap = this.lastDab.distanceTo(this.spot);
    const n = Math.min(BRUSH.maxDabs, Math.floor(gap / spacing));
    // Past maxDabs they spread out to reach the spot, so a line can't fall behind the aim.
    step.subVectors(this.spot, this.lastDab).setLength(n === BRUSH.maxDabs ? gap / n : spacing);
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
