import * as THREE from 'three';
import GUI from 'lil-gui';
import { PAINT, type CapSpec } from '../config';
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
//  - a reticle on the wall: the real size and shape of the spot
// Z shows the panel, X cycles nibs.

export const NIBS = ['round', 'chisel', 'needle'] as const;
export type Nib = (typeof NIBS)[number];

export const FEEL = {
  on: true,
  nib: 'round' as Nib,
  // Brush (sandbox/brush.ts): paint at once, as a continuous stroke
  brush: true,
  /** One pass of a stroke reaches about this opacity (Shift + wheel). */
  opacity: 0.85,
  /** Dab spacing, a fraction of the dab's radius. */
  spacing: 0.2,
  /** Aim smoothing (StreamLine), 0 = off. */
  streamline: 0.25,
  closeSoft: 0.3,
  farSoft: 0.95,
  // Distance
  closeAt: 0.25,
  farAt: 2.5,
  closeSize: 0.55,
  farSize: 2.2,
  closeFlow: 1.8,
  closeDrips: 4,
  // Overspray
  overspray: 0.5,
  oversprayCone: 3.5,
  oversprayAmount: 0.12,
  // Spatter
  spatter: 0.03,
  spatterLowPressure: 0.25,
  spatterSize: 0.7,
  spit: 1,
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
  // Reticle
  reticle: true,
};

// --- Per particle ---

const tmp = new THREE.Vector3();

export interface Landing {
  /** Paint per particle, radius (m), softness, drips per m², shape. */
  amount: number;
  radius: number;
  softness: number;
  drips: number;
  shape: DotShape | undefined;
}

/** How far into the far range a hit at `distance` is: 0 close, 1 far. */
export const farness = (distance: number) => THREE.MathUtils.clamp((distance - FEEL.closeAt) / (FEEL.farAt - FEEL.closeAt), 0, 1);

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

// --- Reticle: the spot as it will land ---

const VS = 'varying vec2 vUv; void main() { vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const FS = /* glsl */ `
uniform vec3 uColor;
uniform float uState;
uniform float uTail;
uniform float uTime;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  float aa = fwidth(r) * 1.5;
  float ring = smoothstep(0.86 - aa, 0.86, r) * (1.0 - smoothstep(1.0 - aa, 1.0, r));
  // Far: dashed ring; close: solid.
  float a = atan(vUv.y, vUv.x);
  float dash = mix(step(0.0, sin(a * 18.0 + uTime * 2.0)), 1.0, step(uState, 1.5));
  float fill = (1.0 - smoothstep(0.86 - aa, 0.86, r)) * 0.12 * (1.0 - uTail * max(vUv.x, 0.0));
  float dot = 1.0 - smoothstep(0.05 - aa, 0.05, r);
  vec3 c = uColor;
  if (uState < 0.5) c = mix(c, vec3(1.0, 0.25, 0.1), 0.7);
  float alpha = max(ring * dash * 0.85, max(fill, dot * 0.9));
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(c, alpha);
}`;

const zAxis = new THREE.Vector3();
const xAxis = new THREE.Vector3();
const yAxis = new THREE.Vector3();
const basis = new THREE.Matrix4();

export class SprayReticle {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private uniforms = { uColor: { value: new THREE.Color() }, uState: { value: 1 }, uTail: { value: 0 }, uTime: { value: 0 } };

  constructor(scene: THREE.Scene) {
    const m = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    scene.add(this.mesh);
  }

  hide() {
    this.mesh.visible = false;
  }

  /** At `point` on face `rect` (normal `normal`), aimed along `dir` from `distance` m. */
  show(point: THREE.Vector3, normal: THREE.Vector3, rect: Rect | undefined, dir: THREE.Vector3, distance: number, cap: CapSpec, color: string, time: number) {
    if (!FEEL.on || !FEEL.reticle) return this.hide();
    const n = zAxis.copy(normal);
    if (n.dot(dir) > 0) n.negate();
    // Where most particles land (see aim in particles.ts) + the dot.
    const t = farness(distance);
    let r = distance * Math.tan(cap.spread * 0.25) + (cap.dotSize / 2) * THREE.MathUtils.lerp(FEEL.closeSize, FEEL.farSize, t);
    if (FEEL.nib === 'needle') r *= 0.5;
    const s = slantShape(rect, dir, slant);
    let elong = s && FEEL.slant > 0 ? s.elong : 1;
    // The long axis along the aim, laid into the wall.
    xAxis.copy(dir).addScaledVector(n, -dir.dot(n));
    if (xAxis.lengthSq() < 1e-6) xAxis.set(0, 1, 0).cross(n);
    if (xAxis.lengthSq() < 1e-6) xAxis.set(1, 0, 0);
    xAxis.normalize();
    if (FEEL.nib === 'chisel' && rect?.face) {
      // The nib: fixed on the wall at its angle, from the face's u axis.
      const u = tmp.copy(rect.face.uAxis).normalize();
      const v = yAxis.copy(rect.face.vAxis).normalize();
      const a = (FEEL.chiselAngle * Math.PI) / 180;
      xAxis.copy(u).multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a)).normalize();
      elong = FEEL.chiselRatio;
      r = (cap.dotSize / 2) * 0.45 + distance * Math.tan(cap.spread * 0.25);
    }
    yAxis.crossVectors(n, xAxis);
    basis.makeBasis(xAxis, yAxis, n);
    this.mesh.quaternion.setFromRotationMatrix(basis);
    this.mesh.position.copy(point).addScaledVector(n, 0.004).addScaledVector(xAxis, r * (elong - 1) * 0.35);
    this.mesh.scale.set(2 * r * elong, 2 * r, 1);
    this.uniforms.uColor.value.set(color);
    // 0 too close (runs), 1 sweet, 2 far (speckled, weak).
    this.uniforms.uState.value = distance < FEEL.closeAt * 1.3 ? 0 : distance < FEEL.farAt * 0.6 ? 1 : 2;
    this.uniforms.uTail.value = s ? FEEL.tail * (1 - s.cos) : 0;
    this.uniforms.uTime.value = time;
    this.mesh.visible = true;
  }
}

// --- Panel and hotkeys ---

const label = document.createElement('div');
let gui: GUI | null = null;

export function flash(text: string) {
  label.textContent = text;
  label.style.opacity = '1';
  clearTimeout((flash as { t?: number }).t);
  (flash as { t?: number }).t = window.setTimeout(() => (label.style.opacity = '0'), 1200);
}

export function initFeel() {
  Object.assign(label.style, {
    position: 'fixed', top: '30%', width: '100%', textAlign: 'center', font: 'bold 28px monospace',
    color: '#fff', textShadow: '0 0 6px #000, 0 0 2px #000', pointerEvents: 'none', opacity: '0', transition: 'opacity 0.3s', zIndex: '9999',
  });
  document.body.appendChild(label);
  gui = new GUI({ title: 'SANDBOX · Spray feel (Z)' });
  gui.domElement.style.zIndex = '9998';
  gui.add(FEEL, 'on');
  gui.add(FEEL, 'nib', NIBS as unknown as string[]).name('nib (X)');
  gui.add(FEEL, 'reticle');
  // Smooth opacity, like a drawing app: the game's chunky alpha steps off (the panel brings them back).
  PAINT.alphaSteps = 0;
  gui.add(PAINT, 'alphaSteps', 0, 16, 1).name('alpha steps (game: 8)');
  const br = gui.addFolder('Brush');
  br.add(FEEL, 'brush').name('brush (else particles)');
  br.add(FEEL, 'opacity', 0.02, 1).name('opacity (Shift+wheel)');
  br.add(FEEL, 'spacing', 0.05, 1);
  br.add(FEEL, 'streamline', 0, 1);
  br.add(FEEL, 'closeSoft', 0, 1);
  br.add(FEEL, 'farSoft', 0, 1);
  const d = gui.addFolder('Distance');
  d.add(FEEL, 'closeAt', 0.05, 1);
  d.add(FEEL, 'farAt', 0.5, 4.6);
  d.add(FEEL, 'closeSize', 0.2, 1.5);
  d.add(FEEL, 'farSize', 0.5, 5);
  d.add(FEEL, 'closeFlow', 0.5, 4);
  d.add(FEEL, 'closeDrips', 0, 20);
  const o = gui.addFolder('Overspray / spatter');
  o.add(FEEL, 'overspray', 0, 1.5);
  o.add(FEEL, 'oversprayCone', 1, 8);
  o.add(FEEL, 'oversprayAmount', 0, 0.3);
  o.add(FEEL, 'spatter', 0, 0.4);
  o.add(FEEL, 'spatterLowPressure', 0, 1);
  o.add(FEEL, 'spatterSize', 0.1, 1.5);
  o.add(FEEL, 'spit', 0, 3);
  o.add(FEEL, 'spitTime', 0, 0.4);
  o.add(FEEL, 'releaseTail', 0, 0.5);
  const s = gui.addFolder('Slant / nib / gesture');
  s.add(FEEL, 'slant', 0, 1);
  s.add(FEEL, 'maxElong', 1, 8);
  s.add(FEEL, 'tail', 0, 1);
  s.add(FEEL, 'chiselRatio', 1.5, 10);
  s.add(FEEL, 'chiselAngle', 0, 180);
  s.add(FEEL, 'speedThin', 0, 1);
  gui.hide();
  window.addEventListener('keydown', (e) => {
    // Not while typing a number into the panel.
    if (e.repeat || e.target instanceof HTMLInputElement) return;
    if (e.code === 'KeyZ') {
      if (gui!._hidden) gui!.show();
      else gui!.hide();
    } else if (e.code === 'KeyX') {
      FEEL.nib = NIBS[(NIBS.indexOf(FEEL.nib) + 1) % NIBS.length];
      flash(`NIB: ${FEEL.nib.toUpperCase()}`);
    } else return;
    refreshPanel();
  });
}

export function refreshPanel() {
  gui?.controllersRecursive().forEach((c) => c.updateDisplay());
}

/** Shift + wheel: the brush's opacity, in 5% steps. */
export function stepOpacity(steps: number) {
  FEEL.opacity = THREE.MathUtils.clamp(Math.round((FEEL.opacity - steps * 0.05) * 20) / 20, 0.05, 1);
  flash(`OPACITY ${Math.round(FEEL.opacity * 100)}%`);
  refreshPanel();
}
