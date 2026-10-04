import * as THREE from 'three';
import { ATMOS, SMOKE } from '../config';
import type { Emitter } from '../level/build-prop';
import { setHex } from '../hex-color';

// Smoke / warm air from vents, exhausts and AC units: one Points draw for the
// whole level. Each particle's position is a function of time and its seed
// in the vertex shader (like the rain), so the CPU does nothing per particle.
// Particles are ordered by slot (all emitters' slot 0, then slot 1, ...), so
// SMOKE.perEmitter is just the draw range. Rebuilt when the level changes.

const MAX_PER = 48;
/** SMOKE.color, before lighting. */
const color = new THREE.Color();

const material = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: {
    uTime: { value: 0 },
    uLife: { value: 4 },
    uRise: { value: 2 },
    uDrift: { value: 0.5 },
    uWind: { value: new THREE.Vector3() },
    uStart: { value: 0.2 },
    uEnd: { value: 1 },
    uOpacity: { value: 0.2 },
    uColor: { value: new THREE.Color() },
    uFogDensity: { value: 0.01 },
    uScale: { value: 300 },
  },
  vertexShader: /* glsl */ `
    attribute vec3 push;
    attribute vec3 seed;
    uniform float uTime, uLife, uRise, uDrift, uStart, uEnd, uFogDensity, uScale;
    uniform vec3 uWind;
    varying float vAlpha;
    varying float vLife;
    void main() {
      float life = fract(uTime / uLife + seed.x);
      vLife = life;
      vec3 jitter = vec3(seed.y - 0.5, 0.0, seed.z - 0.5);
      vec3 p = position
        + push * (1.0 - exp(-life * 4.0))
        + vec3(0.0, uRise * life, 0.0)
        + uWind * uDrift * life * life
        + jitter * (0.15 + 0.6 * life)
        + vec3(sin(uTime * 0.9 + seed.y * 20.0), 0.0, cos(uTime * 0.7 + seed.z * 20.0)) * 0.12 * life;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      float d = length(mv.xyz);
      vAlpha = smoothstep(0.0, 0.12, life) * pow(1.0 - life, 1.5) * exp(-uFogDensity * d);
      gl_PointSize = mix(uStart, uEnd, life) * uScale / max(d, 0.2);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform float uOpacity;
    uniform vec3 uColor;
    varying float vAlpha;
    varying float vLife;
    void main() {
      float r = length(gl_PointCoord - 0.5) * 2.0;
      float a = (1.0 - r * r) * vAlpha * uOpacity;
      if (a <= 0.004) discard;
      gl_FragColor = vec4(uColor, a);
    }`,
});

export class Smoke {
  private points: THREE.Points | null = null;
  private count = 0;

  constructor(private scene: THREE.Scene) {}

  /** Call with the drawing-buffer height so puff sizes match the view. */
  setViewHeight(px: number, fov: number) {
    material.uniforms.uScale.value = px / (2 * Math.tan((fov * Math.PI) / 360));
  }

  rebuild(emitters: Emitter[]) {
    if (this.points) {
      this.points.geometry.dispose();
      this.scene.remove(this.points);
      this.points = null;
    }
    const src = emitters.filter((e) => e.kind === 'smoke');
    this.count = src.length;
    if (!src.length) return;
    const n = src.length * MAX_PER;
    const pos = new Float32Array(n * 3);
    const push = new Float32Array(n * 3);
    const seed = new Float32Array(n * 3);
    for (let k = 0; k < MAX_PER; k++) {
      src.forEach((e, j) => {
        const i = k * src.length + j;
        pos.set([e.pos.x, e.pos.y, e.pos.z], i * 3);
        push.set([e.dir.x, e.dir.y, e.dir.z], i * 3);
        // Spread births evenly over the life so the stream is steady.
        seed.set([(k + Math.random() * 0.8) / MAX_PER, Math.random(), Math.random()], i * 3);
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('push', new THREE.BufferAttribute(push, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
    this.points = new THREE.Points(g, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    this.scene.add(this.points);
  }

  /** `time`: game clock (stops while paused); `light`: how lit the smoke looks (ambient + lightning). */
  update(time: number, light: number) {
    if (!this.points) return;
    const S = SMOKE;
    this.points.visible = S.enabled && S.perEmitter > 0;
    this.points.geometry.setDrawRange(0, this.count * Math.min(MAX_PER, Math.round(S.perEmitter)));
    const u = material.uniforms;
    u.uTime.value = time;
    u.uLife.value = Math.max(0.5, S.life);
    u.uRise.value = S.rise;
    u.uDrift.value = S.drift;
    u.uWind.value.fromArray(ATMOS.wind);
    u.uStart.value = S.startSize;
    u.uEnd.value = S.endSize;
    u.uOpacity.value = S.opacity;
    u.uColor.value.copy(setHex(color, S.color)).multiplyScalar(light);
    u.uFogDensity.value = ATMOS.fogDensity;
  }
}
