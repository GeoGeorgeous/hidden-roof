import * as THREE from 'three';
import { SPRAY, type CapSpec } from '../config';
import type { PaintSurface, PaintSystem, Rgb } from '../painting';
import { solidsNear } from '../level/solids';
import { paintRandom } from '../lcg';
import { facePoint, type FacePoint } from '../surfaces';
import type { DotShape } from '../paint-raster';
import { FEEL, landing, type Landing } from '../sandbox/feel';
import { mistMaterial, updateMist } from '../sandbox/mist';

// Visual spray particles. Each one raycasts once when emitted, flies from the
// nozzle to its hit point, and stamps paint into the surface texture on arrival.
// Other players' particles (show) only fly: their paint comes as paint ops.
// Particles never persist: the pool is fixed size.

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  /** Its whole flight (s): how far along it is, for the mist (sandbox/mist.ts). */
  span: number;
  /** Sandbox spray plume: only seen, slowing as it goes, gone after `limit` m (the wall) or its life. */
  plume: boolean;
  dist: number;
  limit: number;
  /** Launched since the last update: drawn where it starts before it moves. */
  fresh: boolean;
  surface: PaintSurface | null;
  /** PaintSystem.epoch at emit: a particle from before a wipe (LOAD) lands without paint. */
  epoch: number;
  at: FacePoint;
  amount: number;
  radius: number;
  softness: number;
  /** Paint runs it may start, per m² (its cap's). */
  drips: number;
  rgb: Rgb;
  shape: DotShape | undefined;
}

export interface EmitParams {
  count: number;
  eye: THREE.Vector3;
  nozzle: THREE.Vector3;
  forward: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  cap: CapSpec;
  flow: number;
  /** sRGB 0..1 for paint, and display color for the points. */
  rgb: Rgb;
  display: THREE.Color;
  /** Sandbox (sandbox/feel.ts): cone multiplier. */
  cone?: number;
}

const land: Landing = { amount: 0, radius: 0, softness: 0, drips: 0, shape: undefined };
const hitDir = new THREE.Vector3();

/** The wall one other player's spray found, kept while their aim holds (SPRAY.others): where and how it was cast, how long ago, and the wall's plane. */
export class WallMemo {
  readonly eye = new THREE.Vector3();
  readonly forward = new THREE.Vector3();
  readonly plane = new THREE.Plane();
  /** Seconds sprayed since the cast; Infinity: none kept. */
  age = Infinity;
  onWall = false;
}

/** Another player's spray, to be seen only; `dt`: the frame it came out over. */
export type ShowParams = Omit<EmitParams, 'flow' | 'rgb'> & { dt: number; memo: WallMemo };

const dir = new THREE.Vector3();
const target = new THREE.Vector3();
const ray = new THREE.Ray();

/** A particle's direction into `dir`: in the cap's cone around the aim, Gaussian-ish, clamped. */
function aim(e: Pick<EmitParams, 'forward' | 'right' | 'up' | 'cap'>, random: () => number, cone = 1) {
  const r = Math.tan(Math.min(1, Math.abs(gauss(random)) * 0.5) * ((e.cap.spread * cone) / 2));
  const a = random() * Math.PI * 2;
  return dir.copy(e.forward).addScaledVector(e.right, Math.cos(a) * r).addScaledVector(e.up, Math.sin(a) * r).normalize();
}

export class SprayParticles {
  private live: Particle[] = [];
  private free: Particle[] = [];
  private points: THREE.Points;
  private positions: Float32Array;
  private colors: Float32Array;
  private ages: Float32Array;
  private seeds: Float32Array;
  private plain: THREE.PointsMaterial;
  private mist = mistMaterial();
  private raycaster = new THREE.Raycaster();
  private candidates: THREE.Object3D[] = [];

  constructor(
    scene: THREE.Scene,
    private paint: PaintSystem,
    private solids: THREE.Mesh[],
  ) {
    this.positions = new Float32Array(SPRAY.maxParticles * 3);
    this.colors = new Float32Array(SPRAY.maxParticles * 3);
    this.ages = new Float32Array(SPRAY.maxParticles);
    this.seeds = new Float32Array(SPRAY.maxParticles);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('age', new THREE.BufferAttribute(this.ages, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('seed', new THREE.BufferAttribute(this.seeds, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.plain = new THREE.PointsMaterial({ vertexColors: true, size: SPRAY.particleSize, sizeAttenuation: true });
    this.points = new THREE.Points(g, this.plain);
    this.points.onBeforeRender = (renderer) => updateMist(this.mist, renderer);
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < SPRAY.maxParticles; i++) {
      this.free.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, span: 0, plume: false, dist: 0, limit: 0, fresh: false, surface: null, epoch: 0, at: { rect: 0, u: 0, v: 0 }, amount: 0, radius: 0, softness: 0, drips: 0, rgb: [0, 0, 0], shape: undefined });
    }
  }

  get count() {
    return this.live.length;
  }

  /** Launches `e.count` particles; returns how many will land on paint-taking surface. */
  emit(e: EmitParams) {
    // Broad phase: only solids near the player can be hit.
    solidsNear(this.solids, e.eye, SPRAY.reach, this.candidates);
    const { cap } = e;
    let landed = 0;
    const feel = FEEL.on;
    if (plumeOn()) {
      // One ray: the plume never goes past the wall.
      const hit = this.cast(e.eye, e.forward);
      this.plume(e, hit ? hit.distance : SPRAY.reach);
      return 0;
    }
    for (let i = 0; i < e.count; i++) {
      const p = this.free.pop();
      if (!p) break;
      const hit = this.cast(e.eye, hitDir.copy(aim(e, paintRandom.spray, e.cone ?? 1)));
      this.launch(p, e, hit ? hit.point : target.copy(e.eye).addScaledVector(hitDir, SPRAY.reach));
      p.surface = hit ? (this.paint.get(hit.object) ?? null) : null;
      // Sandbox: the brush paints (sandbox/brush.ts); particles only show the spray.
      if (feel && FEEL.brush) {
        if (p.surface) landed++;
        p.surface = null;
        continue;
      }
      if (hit && p.surface) {
        landed++;
        facePoint(p.surface.geo, hit.faceIndex!, hit.uv!, p.at);
        p.epoch = this.paint.epoch;
        const fall = hit.distance <= SPRAY.falloffStart ? 1 : 1 - (hit.distance - SPRAY.falloffStart) / (SPRAY.reach - SPRAY.falloffStart);
        const base = cap.strength * Math.max(0.15, e.flow) * fall * (0.6 + paintRandom.spray() * 0.4);
        p.rgb = e.rgb;
        if (!feel) {
          p.amount = base;
          p.radius = cap.dotSize / 2;
          p.softness = cap.softness;
          p.drips = cap.drips;
          p.shape = undefined;
          continue;
        }
        landing(cap, base, hit.distance, p.surface.geo.rects[p.at.rect], hitDir, land);
        p.amount = land.amount;
        p.radius = land.radius;
        p.softness = land.softness;
        p.drips = land.drips;
        p.shape = land.shape;
      }
    }
    return landed;
  }

  /**
   * Another player's spray, only to be seen: one ray along their aim finds the
   * wall (kept in `memo` while their eye and aim hold, SPRAY.others), and each particle flies to where its own ray meets that wall's plane
   * (or SPRAY.reach), with no ray of its own and no draw from the paint's
   * random streams. Each is already on its way for part of the frame, so the
   * frame's batch reads as a stream, not a clump.
   */
  show(e: ShowParams) {
    if (plumeOn()) return this.plume(e, Infinity);
    const m = e.memo;
    const o = SPRAY.others;
    m.age += e.dt;
    if (m.age > o.reuse || m.eye.distanceToSquared(e.eye) > o.move * o.move || m.forward.dot(e.forward) < Math.cos((o.aim * Math.PI) / 180)) {
      solidsNear(this.solids, e.eye, SPRAY.reach, this.candidates);
      const hit = this.cast(e.eye, e.forward);
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
      ray.set(e.eye, aim(e, Math.random));
      const onWall = m.onWall && ray.intersectPlane(m.plane, target) && target.distanceTo(e.eye) < SPRAY.reach;
      this.launch(p, e, onWall ? target : ray.at(SPRAY.reach, target));
      const early = Math.min(Math.random() * e.dt, p.life);
      p.pos.addScaledVector(p.vel, early);
      p.life -= early;
    }
  }

  /** Sandbox: what the aim meets (a paintable surface or not), for the reticle. */
  probe(eye: THREE.Vector3, forward: THREE.Vector3, near = true) {
    // near false: the candidates of the last probe or emit from about here.
    if (near) solidsNear(this.solids, eye, SPRAY.reach, this.candidates);
    const hit = this.cast(eye, forward);
    const surface = hit ? this.paint.get(hit.object) : undefined;
    if (!hit || !surface || !hit.face) return null;
    const at = facePoint(surface.geo, hit.faceIndex!, hit.uv!, { rect: 0, u: 0, v: 0 });
    return { point: hit.point, distance: hit.distance, normal: hit.face.normal, rect: surface.geo.rects[at.rect], surface, at };
  }

  /** The first of the candidates (solidsNear) hit within SPRAY.reach. */
  private cast(from: THREE.Vector3, along: THREE.Vector3) {
    this.raycaster.set(from, along);
    this.raycaster.far = SPRAY.reach;
    return this.candidates.length ? this.raycaster.intersectObjects(this.candidates, false)[0] : undefined;
  }

  /**
   * Sandbox: the spray as it leaves the nozzle, only seen (the brush paints):
   * fine specks in a cone toward the aim, slowing in the air and fading out
   * before they get far, never past `wall` (m along the aim from the eye).
   */
  private plume(e: Omit<EmitParams, 'flow' | 'rgb'>, wall: number) {
    const axis = hitDir.copy(e.eye).addScaledVector(e.forward, Math.min(wall, SPRAY.reach)).sub(e.nozzle);
    const limit = Number.isFinite(wall) ? axis.length() - 0.03 : Infinity;
    axis.normalize();
    const n = Math.floor(e.count * FEEL.mistCount + Math.random());
    for (let i = 0; i < n; i++) {
      const p = this.free.pop();
      if (!p) break;
      p.pos.copy(e.nozzle);
      p.vel.copy(aim({ ...e, forward: axis }, Math.random, (e.cone ?? 1) * FEEL.mistCone)).multiplyScalar(FEEL.mistSpeed * (0.5 + Math.random()));
      p.life = p.span = FEEL.mistLife * (0.4 + 0.6 * Math.random());
      p.plume = true;
      p.dist = 0;
      p.limit = limit;
      p.surface = null;
      this.add(p, e.display);
    }
  }

  /** Sends `p` from the nozzle to `end`, in the display color. */
  private launch(p: Particle, e: Pick<EmitParams, 'nozzle' | 'display'>, end: THREE.Vector3) {
    p.pos.copy(e.nozzle);
    p.vel.subVectors(end, e.nozzle);
    const dist = p.vel.length();
    p.life = dist / SPRAY.particleSpeed;
    p.span = p.life;
    p.plume = false;
    p.vel.multiplyScalar(SPRAY.particleSpeed / Math.max(dist, 1e-4));
    this.add(p, e.display);
  }

  private add(p: Particle, display: THREE.Color) {
    p.fresh = true;
    const k = this.live.length * 3;
    this.colors[k] = display.r;
    this.colors[k + 1] = display.g;
    this.colors[k + 2] = display.b;
    this.seeds[this.live.length] = Math.random();
    this.live.push(p);
  }

  update(dt: number) {
    const list = this.live;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      // Launched after the last update: its first frame shows it leaving the nozzle.
      // The plume: each speck already on its way for part of the frame, so a frame's batch is a stream, not a bead.
      const step = p.fresh ? (p.plume ? Math.random() * dt : 0) : dt;
      p.fresh = false;
      if (p.plume) {
        p.vel.multiplyScalar(Math.exp(-FEEL.mistDrag * step));
        p.dist += p.vel.length() * step;
        if (p.dist >= p.limit) p.life = 0;
      }
      p.pos.addScaledVector(p.vel, Math.min(step, Math.max(p.life, 0)));
      p.life -= step;
      if (p.life <= 0) {
        if (p.surface && p.epoch === this.paint.epoch) this.paint.stamp(p.surface, p.at, p.radius, p.amount, p.rgb, p.softness, p.drips, false, p.shape);
        p.surface = null;
        this.free.push(p);
        continue;
      }
      // Compact in place, carrying colors along.
      if (n !== i) {
        for (let c = 0; c < 3; c++) this.colors[n * 3 + c] = this.colors[i * 3 + c];
        this.seeds[n] = this.seeds[i];
      }
      this.ages[n] = p.span > 0 ? 1 - p.life / p.span : 1;
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
    g.attributes.age.needsUpdate = true;
    g.attributes.seed.needsUpdate = true;
    this.points.material = plumeOn() ? this.mist : this.plain;
  }
}

/** Sandbox: the brush paints, so the particles are only a plume at the nozzle (sandbox/mist.ts). */
const plumeOn = () => FEEL.on && FEEL.brush && FEEL.mist;

function gauss(random: () => number) {
  return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
}
