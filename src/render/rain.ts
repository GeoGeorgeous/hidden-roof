import * as THREE from 'three';
import { ATMOS } from '../config';
import { HEIGHT_GLSL, type Heightmap } from './heightmap';

// Rain: one LineSegments draw for all drops.
// Positions are computed in the vertex shader from a seed + time; drops wrap in
// a world-anchored box around the camera, so nothing is updated per drop on
// the CPU. Density is just the draw range.

const MAX_DROPS = 24000;
const R = 18; // half-width of the rain box
const H = 26; // height of the rain box

export class Rain {
  private drops: THREE.LineSegments;
  private uniforms = {
    uTime: { value: 0 },
    uCam: { value: new THREE.Vector3() },
    uSpeed: { value: ATMOS.rainSpeed },
    uWind: { value: new THREE.Vector3(...ATMOS.wind) },
    uFogDensity: { value: ATMOS.fogDensity },
    uColor: { value: new THREE.Color(ATMOS.rainColor) },
    uOpacity: { value: ATMOS.rainOpacity },
    uHeight: { value: null as THREE.Texture | null },
    uHOrigin: { value: new THREE.Vector2() },
    uHSize: { value: new THREE.Vector2(1, 1) },
  };

  constructor(scene: THREE.Scene) {
    const seeds = new Float32Array(MAX_DROPS * 2 * 3);
    const tails = new Float32Array(MAX_DROPS * 2);
    for (let i = 0; i < MAX_DROPS; i++) {
      const s = [Math.random(), Math.random(), Math.random()];
      for (let k = 0; k < 2; k++) {
        seeds.set(s, (i * 2 + k) * 3);
        tails[i * 2 + k] = k;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_DROPS * 2 * 3), 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seeds, 3));
    g.setAttribute('tail', new THREE.BufferAttribute(tails, 1));
    this.drops = new THREE.LineSegments(g, this.dropMaterial());
    this.drops.frustumCulled = false;
    scene.add(this.drops);
  }

  setHeightmap(h: Heightmap) {
    this.uniforms.uHeight.value = h.texture;
    this.uniforms.uHOrigin.value.copy(h.origin);
    this.uniforms.uHSize.value.copy(h.size);
  }

  update(time: number, cam: THREE.Vector3) {
    const on = ATMOS.rain;
    this.drops.visible = on && ATMOS.rainDensity > 0 && ATMOS.rainOpacity > 0;
    this.drops.geometry.setDrawRange(0, Math.floor(MAX_DROPS * ATMOS.rainDensity) * 2);
    const u = this.uniforms;
    u.uTime.value = time;
    u.uCam.value.copy(cam);
    u.uSpeed.value = ATMOS.rainSpeed;
    u.uWind.value.set(...ATMOS.wind);
    u.uFogDensity.value = ATMOS.fogDensity;
    u.uColor.value.set(ATMOS.rainColor); // hex is sRGB; the uniform is linear (drawn into the HDR target)
    u.uOpacity.value = ATMOS.rainOpacity;
  }

  private dropMaterial() {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        ${HEIGHT_GLSL}
        attribute vec3 seed;
        attribute float tail;
        uniform float uTime;
        uniform vec3 uCam;
        uniform float uSpeed;
        uniform vec3 uWind;
        uniform float uFogDensity;
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          vec3 vel = vec3(uWind.x, -uSpeed, uWind.z);
          vec3 box = vec3(${2 * R}.0, ${H}.0, ${2 * R}.0);
          vec3 lo = uCam - vec3(${R}.0, ${H / 2}.0, ${R}.0);
          vec3 p0 = seed * box + vel * uTime;
          vec3 p = lo + mod(p0 - lo, box);
          p -= normalize(vel) * tail * 0.55;
          float hidden = p.y < heightAt(p.xz) ? 0.0 : 1.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vAlpha = hidden * exp(-uFogDensity * 1.5 * length(mv.xyz)) * mix(0.09, 0.02, tail) * uOpacity;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(uColor, min(vAlpha, 1.0));
        }`,
    });
  }
}
