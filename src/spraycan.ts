import * as THREE from 'three';
import { CAPS, PAINT, PRESSURE, SPRAY } from './config';
import type { PaintSurface, PaintSystem } from './painting';
import type { Input } from './input';
import type { Audio } from './audio';

// The can: pressure model, caps, view model, and visual particles.
// Each particle carries a precomputed hit; paint is stamped when it arrives.

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  surface: PaintSurface | null;
  uv: THREE.Vector2;
  faceIndex: number;
  amount: number;
  radius: number;
}

const tmpDir = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();
const tmpB = new THREE.Vector3();

export class SprayCan {
  capIndex = 0;
  pressure = 1;
  /** 0..1 flow actually coming out this frame (for HUD/audio). */
  flow = 0;
  spraying = false;

  readonly viewModel = new THREE.Group();
  private canBody = new THREE.Group();
  private nozzle: THREE.Mesh;
  private nozzleTip = new THREE.Object3D();

  private particles: Particle[] = [];
  private free: Particle[] = [];
  private points: THREE.Points;
  private positions: Float32Array;
  private emitCarry = 0;
  private shakeT = 0;
  private sputterOn = true;
  private sputterTimer = 0;
  private raycaster = new THREE.Raycaster();
  private candidates: THREE.Object3D[] = [];
  private recoil = 0;

  constructor(
    scene: THREE.Scene,
    private paint: PaintSystem,
    private solids: THREE.Mesh[],
    private audio: Audio,
  ) {
    // --- View model (rendered in its own pass, positioned relative to the camera).
    const color = new THREE.Color().setRGB(PAINT.color[0] / 255, PAINT.color[1] / 255, PAINT.color[2] / 255, THREE.SRGBColorSpace);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.17, 12), new THREE.MeshLambertMaterial({ color: '#d8d8d8' }));
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0335, 0.0335, 0.09, 12), new THREE.MeshLambertMaterial({ color }));
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.033, 0.025, 12), new THREE.MeshLambertMaterial({ color: '#c0c0c0' }));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.014, 8), new THREE.MeshLambertMaterial({ color: '#f4f4f4' }));
    this.nozzle = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.006), new THREE.MeshBasicMaterial({ color: '#202020' }));
    label.position.y = -0.01;
    shoulder.position.y = 0.0975;
    cap.position.y = 0.117;
    this.nozzle.position.set(0, 0.119, -0.009);
    this.nozzleTip.position.set(0, 0.119, -0.012);
    this.canBody.add(body, label, shoulder, cap, this.nozzle, this.nozzleTip);
    this.canBody.rotation.set(-0.12, 0.25, 0.08);
    this.viewModel.add(this.canBody);
    this.canBody.position.set(0.2, -0.22, -0.5);

    // --- Particles.
    this.positions = new Float32Array(SPRAY.maxParticles * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ color, size: SPRAY.particleSize, sizeAttenuation: true }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let i = 0; i < SPRAY.maxParticles; i++) {
      this.free.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, surface: null, uv: new THREE.Vector2(), faceIndex: 0, amount: 0, radius: 0 });
    }
  }

  get cap() {
    return CAPS[this.capIndex];
  }

  get particleCount() {
    return this.particles.length;
  }

  update(dt: number, input: Input, camera: THREE.Camera, eye: THREE.Vector3) {
    if (input.wheelSteps !== 0) {
      this.capIndex = (this.capIndex + (input.wheelSteps > 0 ? 1 : CAPS.length - 1)) % CAPS.length;
      this.audio.click();
    }
    if (input.wasPressed('KeyG') && this.shakeT <= 0) {
      this.shakeT = PRESSURE.shakeDuration;
      this.audio.rattle();
    }
    if (this.shakeT > 0) {
      const prev = this.shakeT;
      this.shakeT = Math.max(0, this.shakeT - dt);
      // Restore gradually across the shake.
      this.pressure = Math.min(1, this.pressure + (PRESSURE.shakeRestore * (prev - this.shakeT)) / PRESSURE.shakeDuration);
    }

    this.spraying = input.lmb && input.locked;
    this.flow = this.spraying ? this.computeFlow(dt) : 0;
    if (this.spraying) this.pressure = Math.max(0, this.pressure - PRESSURE.drainPerSecond * dt);
    this.audio.setHiss(this.flow * this.cap.hissGain, this.capIndex);

    this.updateViewModel(dt, camera);
    if (this.flow > 0) this.emit(dt, camera, eye);
    this.updateParticles(dt);
  }

  private computeFlow(dt: number): number {
    const p = this.pressure;
    if (p <= 0) return 0;
    if (p < PRESSURE.sputterThreshold) {
      this.sputterTimer -= dt;
      if (this.sputterTimer <= 0) {
        this.sputterOn = Math.random() < PRESSURE.sputterDuty;
        this.sputterTimer = 0.03 + Math.random() * 0.12;
      }
      const weak = 0.5 + 0.5 * (p / PRESSURE.sputterThreshold);
      return this.sputterOn ? PRESSURE.minSteadyFlow * weak : 0;
    }
    if (p < PRESSURE.thinThreshold) {
      const t = (p - PRESSURE.sputterThreshold) / (PRESSURE.thinThreshold - PRESSURE.sputterThreshold);
      return PRESSURE.minSteadyFlow + (1 - PRESSURE.minSteadyFlow) * t;
    }
    return 1;
  }

  private updateViewModel(dt: number, camera: THREE.Camera) {
    this.viewModel.position.copy(camera.position);
    this.viewModel.quaternion.copy(camera.quaternion);
    this.recoil += ((this.flow > 0 ? 1 : 0) - this.recoil) * Math.min(1, dt * 20);
    const s = this.shakeT > 0 ? 1 - this.shakeT / PRESSURE.shakeDuration : 0;
    const shake = this.shakeT > 0 ? Math.sin(s * Math.PI * 8) * Math.sin(s * Math.PI) : 0;
    const jitter = this.flow > 0 ? (Math.random() - 0.5) * 0.0015 : 0;
    this.canBody.position.set(0.2 + jitter, -0.22 + shake * 0.06 + jitter, -0.5 + this.recoil * 0.006);
    this.canBody.rotation.set(-0.12 + shake * 0.35, 0.25, 0.08 + shake * 0.15);
    this.nozzle.scale.setScalar(this.capIndex === 1 ? 1.6 : 1);
  }

  private emit(dt: number, camera: THREE.Camera, eye: THREE.Vector3) {
    const cap = this.cap;
    this.emitCarry += cap.rate * this.flow * dt;
    const count = Math.floor(this.emitCarry);
    this.emitCarry -= count;
    if (count === 0) return;

    // Broad phase: only solids near the player can be hit.
    this.candidates.length = 0;
    for (const m of this.solids) {
      const bs = m.geometry.boundingSphere!;
      if (bs.center.distanceTo(eye) - bs.radius < SPRAY.range) this.candidates.push(m);
    }

    const forward = camera.getWorldDirection(new THREE.Vector3());
    const right = tmpB.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3().crossVectors(right, forward);
    this.viewModel.updateMatrixWorld();
    const nozzle = this.nozzleTip.getWorldPosition(new THREE.Vector3());

    for (let i = 0; i < count; i++) {
      const p = this.free.pop();
      if (!p) break;
      // Gaussian-ish cone, clamped.
      const r = Math.min(1, Math.abs(gauss()) * 0.5) * cap.coneAngle;
      const a = Math.random() * Math.PI * 2;
      tmpDir.copy(forward).addScaledVector(right, Math.cos(a) * Math.tan(r)).addScaledVector(up, Math.sin(a) * Math.tan(r)).normalize();

      this.raycaster.set(eye, tmpDir);
      this.raycaster.far = SPRAY.range;
      const hit = this.candidates.length ? this.raycaster.intersectObjects(this.candidates, false)[0] : undefined;

      const target = hit ? hit.point : tmpTarget.copy(eye).addScaledVector(tmpDir, SPRAY.range);
      p.pos.copy(nozzle);
      p.vel.subVectors(target, nozzle);
      const dist = p.vel.length();
      p.life = dist / SPRAY.particleSpeed;
      p.vel.multiplyScalar(SPRAY.particleSpeed / Math.max(dist, 1e-4));
      p.surface = hit ? (this.paint.get(hit.object) ?? null) : null;
      if (hit && p.surface) {
        p.uv.copy(hit.uv!);
        p.faceIndex = hit.faceIndex!;
        const fall = hit.distance <= SPRAY.falloffStart ? 1 : 1 - (hit.distance - SPRAY.falloffStart) / (SPRAY.range - SPRAY.falloffStart);
        p.amount = cap.strength * Math.max(0.15, this.flow) * fall * (0.6 + Math.random() * 0.4);
        p.radius = cap.stampRadius;
      }
      this.particles.push(p);
    }
  }

  private updateParticles(dt: number) {
    const list = this.particles;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const step = Math.min(dt, p.life);
      p.pos.addScaledVector(p.vel, step);
      p.life -= dt;
      if (p.life <= 0) {
        if (p.surface) this.paint.stamp(p.surface, p.uv, p.faceIndex, p.radius, p.amount);
        p.surface = null;
        this.free.push(p);
        continue;
      }
      list[n++] = p;
      this.positions[(n - 1) * 3] = p.pos.x;
      this.positions[(n - 1) * 3 + 1] = p.pos.y;
      this.positions[(n - 1) * 3 + 2] = p.pos.z;
    }
    list.length = n;
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}

function gauss() {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}
