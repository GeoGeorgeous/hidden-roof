import * as THREE from 'three';
import { SPRAY, type CapSpec } from '../config';
import type { PaintSurface, PaintSystem, Rgb } from '../painting';
import { solidsNear } from '../level/solids';
import { paintRandom } from '../lcg';
import { facePoint, type FacePoint } from '../surfaces';

// Visual spray particles. Each one raycasts once when emitted, flies from the
// nozzle to its hit point, and stamps paint into the surface texture on arrival.
// Particles never persist: the pool is fixed size.

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  surface: PaintSurface | null;
  /** PaintSystem.epoch at emit: a particle from before a wipe (LOAD) lands without paint. */
  epoch: number;
  at: FacePoint;
  amount: number;
  radius: number;
  softness: number;
  rgb: Rgb;
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
}

const dir = new THREE.Vector3();
const target = new THREE.Vector3();

export class SprayParticles {
  private live: Particle[] = [];
  private free: Particle[] = [];
  private points: THREE.Points;
  private positions: Float32Array;
  private colors: Float32Array;
  private raycaster = new THREE.Raycaster();
  private candidates: THREE.Object3D[] = [];

  constructor(
    scene: THREE.Scene,
    private paint: PaintSystem,
    private solids: THREE.Mesh[],
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
      this.free.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, surface: null, epoch: 0, at: { rect: 0, u: 0, v: 0 }, amount: 0, radius: 0, softness: 0, rgb: [0, 0, 0] });
    }
  }

  get count() {
    return this.live.length;
  }

  emit(e: EmitParams) {
    // Broad phase: only solids near the player can be hit.
    solidsNear(this.solids, e.eye, SPRAY.range, this.candidates);
    const { cap } = e;
    for (let i = 0; i < e.count; i++) {
      const p = this.free.pop();
      if (!p) break;
      // Gaussian-ish cone, clamped.
      const r = Math.tan(Math.min(1, Math.abs(gauss()) * 0.5) * cap.coneAngle);
      const a = paintRandom.spray() * Math.PI * 2;
      dir.copy(e.forward).addScaledVector(e.right, Math.cos(a) * r).addScaledVector(e.up, Math.sin(a) * r).normalize();

      this.raycaster.set(e.eye, dir);
      this.raycaster.far = SPRAY.range;
      const hit = this.candidates.length ? this.raycaster.intersectObjects(this.candidates, false)[0] : undefined;
      const end = hit ? hit.point : target.copy(e.eye).addScaledVector(dir, SPRAY.range);
      p.pos.copy(e.nozzle);
      p.vel.subVectors(end, e.nozzle);
      const dist = p.vel.length();
      p.life = dist / SPRAY.particleSpeed;
      p.vel.multiplyScalar(SPRAY.particleSpeed / Math.max(dist, 1e-4));
      p.surface = hit ? (this.paint.get(hit.object) ?? null) : null;
      if (hit && p.surface) {
        facePoint(p.surface.geo, hit.faceIndex!, hit.uv!, p.at);
        p.epoch = this.paint.epoch;
        const fall = hit.distance <= SPRAY.falloffStart ? 1 : 1 - (hit.distance - SPRAY.falloffStart) / (SPRAY.range - SPRAY.falloffStart);
        p.amount = cap.strength * Math.max(0.15, e.flow) * fall * (0.6 + paintRandom.spray() * 0.4);
        p.radius = cap.stampRadius;
        p.softness = cap.softness;
        p.rgb = e.rgb;
      }
      const k = this.live.length * 3;
      this.colors[k] = e.display.r;
      this.colors[k + 1] = e.display.g;
      this.colors[k + 2] = e.display.b;
      this.live.push(p);
    }
  }

  update(dt: number) {
    const list = this.live;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.pos.addScaledVector(p.vel, Math.min(dt, p.life));
      p.life -= dt;
      if (p.life <= 0) {
        if (p.surface && p.epoch === this.paint.epoch) this.paint.stamp(p.surface, p.at, p.radius, p.amount, p.rgb, p.softness, 1);
        p.surface = null;
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
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }
}

function gauss() {
  return Math.sqrt(-2 * Math.log(1 - paintRandom.spray())) * Math.cos(2 * Math.PI * paintRandom.spray());
}
