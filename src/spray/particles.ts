import * as THREE from 'three';
import { SPRAY, type CapSpec } from '../config';
import type { WallProbe } from './wall-probe';

// Spray particles, only to be seen: paint comes from the brush (brush.ts), and
// other players' as paint ops. They fly from the nozzle to the wall and are
// gone. Particles never persist: the pool is fixed size.

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  /** Launched since the last update: drawn where it starts before it moves. */
  fresh: boolean;
}

/** The wall one can's spray found, kept while its aim holds (SPRAY.wall): where and how it was cast, how long ago, and the wall's plane. */
export class WallMemo {
  readonly eye = new THREE.Vector3();
  readonly forward = new THREE.Vector3();
  readonly plane = new THREE.Plane();
  /** Seconds sprayed since the cast; Infinity: none kept. */
  age = Infinity;
  onWall = false;
}

interface ShowParams {
  count: number;
  eye: THREE.Vector3;
  nozzle: THREE.Vector3;
  forward: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  cap: CapSpec;
  display: THREE.Color;
  /** The frame it came out over. */
  dt: number;
  memo: WallMemo;
}

const dir = new THREE.Vector3();
const target = new THREE.Vector3();
const ray = new THREE.Ray();

/** A particle's direction into `dir`: in the cap's cone around the aim, Gaussian-ish, clamped. */
function aim(e: ShowParams) {
  const r = Math.tan(Math.min(1, Math.abs(gauss()) * 0.5) * (e.cap.spread / 2));
  const a = Math.random() * Math.PI * 2;
  return dir.copy(e.forward).addScaledVector(e.right, Math.cos(a) * r).addScaledVector(e.up, Math.sin(a) * r).normalize();
}

export class SprayParticles {
  private live: Particle[] = [];
  private free: Particle[] = [];
  private points: THREE.Points;
  private positions: Float32Array;
  private colors: Float32Array;

  constructor(
    scene: THREE.Scene,
    private probe: WallProbe,
  ) {
    this.positions = new Float32Array(SPRAY.maxParticles * 3);
    this.colors = new Float32Array(SPRAY.maxParticles * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ vertexColors: true, size: SPRAY.particleSize, sizeAttenuation: true }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < SPRAY.maxParticles; i++) {
      this.free.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, fresh: false });
    }
  }

  get count() {
    return this.live.length;
  }

  /**
   * One frame of a can's spray: one ray along its aim finds the wall (kept in
   * `memo` while the eye and aim hold, SPRAY.wall), and each particle flies to
   * where its own ray meets that wall's plane (or SPRAY.reach), with no ray of
   * its own. Each is already on its way for part of the frame, so the frame's
   * batch reads as a stream, not a clump.
   */
  show(e: ShowParams) {
    const m = e.memo;
    const o = SPRAY.wall;
    m.age += e.dt;
    if (m.age > o.reuse || m.eye.distanceToSquared(e.eye) > o.move * o.move || m.forward.dot(e.forward) < Math.cos((o.aim * Math.PI) / 180)) {
      this.probe.near(e.eye);
      const hit = this.probe.cast(e.eye, e.forward);
      m.onWall = !!hit?.face;
      // Level meshes sit at the origin: the face normal is in world space.
      if (hit?.face) m.plane.setFromNormalAndCoplanarPoint(hit.face.normal, hit.point);
      m.eye.copy(e.eye);
      m.forward.copy(e.forward);
      m.age = 0;
    }
    for (let i = 0; i < e.count; i++) {
      const p = this.free.pop();
      if (!p) break;
      ray.set(e.eye, aim(e));
      const onWall = m.onWall && ray.intersectPlane(m.plane, target) && target.distanceTo(e.eye) < SPRAY.reach;
      this.launch(p, e, onWall ? target : ray.at(SPRAY.reach, target));
      const early = Math.min(Math.random() * e.dt, p.life);
      p.pos.addScaledVector(p.vel, early);
      p.life -= early;
    }
  }

  /** Sends `p` from the nozzle to `end`, in the display color. */
  private launch(p: Particle, e: ShowParams, end: THREE.Vector3) {
    p.pos.copy(e.nozzle);
    p.vel.subVectors(end, e.nozzle);
    const dist = p.vel.length();
    p.life = dist / SPRAY.particleSpeed;
    p.fresh = true;
    p.vel.multiplyScalar(SPRAY.particleSpeed / Math.max(dist, 1e-4));
    const k = this.live.length * 3;
    this.colors[k] = e.display.r;
    this.colors[k + 1] = e.display.g;
    this.colors[k + 2] = e.display.b;
    this.live.push(p);
  }

  update(dt: number) {
    const list = this.live;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      // Launched after the last update: its first frame shows it leaving the nozzle.
      const step = p.fresh ? 0 : dt;
      p.fresh = false;
      p.pos.addScaledVector(p.vel, Math.min(step, p.life));
      p.life -= step;
      if (p.life <= 0) {
        this.free.push(p);
        continue;
      }
      // Compact in place, carrying colors along.
      if (n !== i) for (let c = 0; c < 3; c++) this.colors[n * 3 + c] = this.colors[i * 3 + c];
      list[n] = p;
      this.positions[n * 3] = p.pos.x;
      this.positions[n * 3 + 1] = p.pos.y;
      this.positions[n * 3 + 2] = p.pos.z;
      n++;
    }
    list.length = n;
    const g = this.points.geometry;
    // Nothing in flight: no draw call.
    this.points.visible = n > 0;
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }
}

function gauss() {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}
