import * as THREE from 'three';
import { SPRAY, type CapSpec } from '../config';
import { plumeMaterial, updatePlume } from './plume-material';
import { plumeLook, plumeStrength, type PlumeLook } from './plume';
import type { WallProbe } from './wall-probe';

// A can's plume, only to be seen: paint comes from the brush (brush.ts), and
// other players' as paint ops. Fine specks leave the nozzle in a cone toward
// the aim, slow in the air and fade out, never past the wall. Specks never
// persist: the pool is fixed size.

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  /** Its whole life (s): how far along it is, for its look. */
  span: number;
  /** How far it went, and how far it may: the wall. */
  dist: number;
  limit: number;
  /** Launched since the last update: it starts a part of the frame on its way, so a frame's batch is a stream, not a bead. */
  fresh: boolean;
}

/** The wall one can's spray found, kept while its aim holds (SPRAY.wall): where and how it was cast, how long ago, and the wall's plane. */
export class WallMemo {
  readonly eye = new THREE.Vector3();
  readonly forward = new THREE.Vector3();
  /** Seconds sprayed since the cast; Infinity: none kept. */
  age = Infinity;
  /** How far the wall is along the aim (m); SPRAY.reach: none. */
  distance = 0;
}

interface ShowParams {
  count: number;
  eye: THREE.Vector3;
  nozzle: THREE.Vector3;
  forward: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  cap: CapSpec;
  /** How much comes out of the can (SprayTool.flow). */
  flow: number;
  display: THREE.Color;
  /** The frame it came out over. */
  dt: number;
  memo: WallMemo;
}

const dir = new THREE.Vector3();
const axis = new THREE.Vector3();
const look: PlumeLook = { cone: 0, size: 0, grow: 1 };

/** A speck's direction into `dir`: around `axis` within the cap's cone, Gaussian-ish, clamped. */
function aim(e: ShowParams) {
  const r = Math.tan(Math.min(1, Math.abs(gauss()) * 0.5) * (look.cone / 2));
  const a = Math.random() * Math.PI * 2;
  // Kept for a flat nib on the marker, a later version. A flat fan: x = cos(a) * r * fan, y = sin(a) * r, turned by its angle.
  return dir.copy(axis).addScaledVector(e.right, Math.cos(a) * r).addScaledVector(e.up, Math.sin(a) * r).normalize();
}

export class SprayParticles {
  private live: Particle[] = [];
  private free: Particle[] = [];
  /** Cans shown since the last update, and what each may take: a crowd thins every plume alike and blanks none. */
  private showing = 0;
  private share = SPRAY.maxParticles;
  private points: THREE.Points;
  private positions: Float32Array;
  private colors: Float32Array;
  private ages: Float32Array;
  private sizes: Float32Array;
  private grows: Float32Array;
  private strengths: Float32Array;

  constructor(
    scene: THREE.Scene,
    private probe: WallProbe,
  ) {
    this.positions = new Float32Array(SPRAY.maxParticles * 3);
    this.colors = new Float32Array(SPRAY.maxParticles * 3);
    this.ages = new Float32Array(SPRAY.maxParticles);
    this.sizes = new Float32Array(SPRAY.maxParticles);
    this.grows = new Float32Array(SPRAY.maxParticles);
    this.strengths = new Float32Array(SPRAY.maxParticles);
    const g = new THREE.BufferGeometry();
    const dynamic = (a: Float32Array, n: number) => new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', dynamic(this.positions, 3));
    g.setAttribute('color', dynamic(this.colors, 3));
    g.setAttribute('age', dynamic(this.ages, 1));
    g.setAttribute('size', dynamic(this.sizes, 1));
    g.setAttribute('grow', dynamic(this.grows, 1));
    g.setAttribute('strength', dynamic(this.strengths, 1));
    g.setDrawRange(0, 0);
    const material = plumeMaterial();
    this.points = new THREE.Points(g, material);
    this.points.onBeforeRender = (renderer) => updatePlume(material, renderer);
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < SPRAY.maxParticles; i++) {
      this.free.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, span: 0, dist: 0, limit: 0, fresh: false });
    }
  }

  get count() {
    return this.live.length;
  }

  /**
   * One frame of a can's spray: one ray along its aim finds the wall (kept in
   * `memo` while the eye and aim hold, SPRAY.wall), and its specks leave the
   * nozzle toward where the aim meets it, with no ray of their own.
   */
  show(e: ShowParams) {
    const m = e.memo;
    const o = SPRAY.wall;
    m.age += e.dt;
    if (m.age > o.reuse || m.eye.distanceToSquared(e.eye) > o.move * o.move || m.forward.dot(e.forward) < Math.cos((o.aim * Math.PI) / 180)) {
      this.probe.near(e.eye);
      m.distance = this.probe.cast(e.eye, e.forward)?.distance ?? SPRAY.reach;
      m.eye.copy(e.eye);
      m.forward.copy(e.forward);
      m.age = 0;
    }
    const p = SPRAY.plume;
    plumeLook(e.cap, look);
    axis.copy(e.eye).addScaledVector(e.forward, m.distance).sub(e.nozzle);
    // Up against a wall the can in hand reaches through it: nothing to show.
    if (axis.dot(e.forward) <= 0) return;
    const limit = axis.length() - p.short;
    axis.normalize();
    this.showing++;
    const strength = plumeStrength(e.flow);
    const n = Math.min(Math.floor(e.count * p.count * strength + Math.random()), this.share, this.free.length);
    for (let i = 0; i < n; i++) {
      const s = this.free.pop()!;
      s.pos.copy(e.nozzle);
      s.vel.copy(aim(e)).multiplyScalar(p.speed * within(p.vary.speed));
      s.life = s.span = p.life * within(p.vary.life);
      s.dist = 0;
      s.limit = limit;
      s.fresh = true;
      const k = this.live.length;
      this.colors[k * 3] = e.display.r;
      this.colors[k * 3 + 1] = e.display.g;
      this.colors[k * 3 + 2] = e.display.b;
      this.sizes[k] = look.size * within(p.vary.size);
      this.grows[k] = look.grow;
      this.strengths[k] = strength;
      this.live.push(s);
    }
  }

  update(dt: number) {
    const list = this.live;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const step = p.fresh ? Math.random() * dt : dt;
      p.fresh = false;
      p.vel.multiplyScalar(Math.exp(-SPRAY.plume.drag * step));
      p.dist += p.vel.length() * step;
      if (p.dist >= p.limit) p.life = 0;
      p.pos.addScaledVector(p.vel, Math.min(step, Math.max(p.life, 0)));
      p.life -= step;
      if (p.life <= 0) {
        this.free.push(p);
        continue;
      }
      // Compact in place, carrying its look along.
      if (n !== i) {
        for (let c = 0; c < 3; c++) this.colors[n * 3 + c] = this.colors[i * 3 + c];
        this.sizes[n] = this.sizes[i];
        this.grows[n] = this.grows[i];
        this.strengths[n] = this.strengths[i];
      }
      this.ages[n] = 1 - p.life / p.span;
      list[n] = p;
      this.positions[n * 3] = p.pos.x;
      this.positions[n * 3 + 1] = p.pos.y;
      this.positions[n * 3 + 2] = p.pos.z;
      n++;
    }
    list.length = n;
    this.share = Math.ceil(this.free.length / Math.max(1, this.showing));
    this.showing = 0;
    const g = this.points.geometry;
    // Nothing in flight: no draw call.
    this.points.visible = n > 0;
    g.setDrawRange(0, n);
    if (!n) return;
    for (const name of ['position', 'color', 'age', 'size', 'grow', 'strength']) {
      const a = g.attributes[name] as THREE.BufferAttribute;
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
  }
}

const within = ([from, to]: [number, number]) => from + (to - from) * Math.random();

function gauss() {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}
