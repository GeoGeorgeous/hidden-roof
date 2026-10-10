import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { ATMOS, VOLUMETRICS } from '../config';
import { SCATTER_MAX, type Lighting } from './lighting';

// Volumetric light (light shafts) as one low-res fullscreen pass:
// every pixel marches its view ray through uniform fog up to the scene depth,
// adding in-scattered moonlight (masked by the moon shadow map, which makes the
// shafts) and light from the nearest lamps (Lighting.scatter: cone + falloff;
// real spot lights in the two shadow slots also use their shadow maps).
// Dithered steps, no temporal accumulation, so the image is stable. Cost
// scales with pixels x steps x (moon + 8 lamps).

const MAX_STEPS = 32;
const SPOTS = SCATTER_MAX;

const ONE = new THREE.DataTexture(new Float32Array([1, 1, 1, 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType);
ONE.needsUpdate = true;

const fragmentShader = /* glsl */ `
#define MAX_STEPS ${MAX_STEPS}
#define SPOTS ${SPOTS}
#define PI 3.14159265
uniform sampler2D tDepth;
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
uniform vec3 uCamPos;
uniform int uSteps;
uniform float uMaxDist;
uniform float uDensity;
uniform float uAniso;
uniform vec3 uMoonColor;
uniform vec3 uMoonDir;
uniform sampler2D uMoonShadow;
uniform mat4 uMoonMatrix;
uniform vec3 uLPos[SPOTS];
uniform vec3 uLDir[SPOTS];
uniform vec3 uLColor[SPOTS];
uniform vec3 uLParams[SPOTS]; // range, cos outer, cos inner
uniform float uDecay;
uniform sampler2D uSpotShadow0;
uniform sampler2D uSpotShadow1;
uniform mat4 uSpotMatrix0;
uniform mat4 uSpotMatrix1;
varying vec2 vUv;

float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

float phase(float c) {
  float g = uAniso;
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5));
}

float lit(sampler2D map, mat4 m, vec3 p, float bias) {
  vec4 c = m * vec4(p, 1.0);
  c.xyz /= c.w;
  if (c.x < 0.0 || c.y < 0.0 || c.x > 1.0 || c.y > 1.0 || c.z > 1.0) return 1.0;
  return step(c.z - bias, texture2D(map, c.xy).r);
}

void main() {
  float depth = texture2D(tDepth, vUv).r;
  vec4 v = uProjInv * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec3 end = (uCamWorld * vec4(v.xyz / v.w, 1.0)).xyz;
  vec3 rd = end - uCamPos;
  float len = length(rd);
  rd /= len;
  len = min(len, uMaxDist);
  float dt = len / float(uSteps);
  float t = dt * ign(gl_FragCoord.xy);
  float moonPhase = phase(dot(rd, uMoonDir));
  float stepT = exp(-uDensity * dt);
  float trans = 1.0;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < MAX_STEPS; i++) {
    if (i >= uSteps) break;
    vec3 p = uCamPos + rd * t;
    vec3 li = uMoonColor * moonPhase * lit(uMoonShadow, uMoonMatrix, p, 0.001);
    for (int j = 0; j < SPOTS; j++) {
      if (uLColor[j].x + uLColor[j].y + uLColor[j].z <= 0.0) continue; // unused pool slot
      vec3 L = uLPos[j] - p;
      float d = length(L);
      vec3 l = L / d;
      float w = clamp(1.0 - pow(d / uLParams[j].x, 4.0), 0.0, 1.0);
      float cone = smoothstep(uLParams[j].y, uLParams[j].z, dot(-l, uLDir[j]));
      float a = w * w * cone / max(pow(d, uDecay), 0.05);
      if (a <= 0.0) continue;
      if (j == 0) a *= lit(uSpotShadow0, uSpotMatrix0, p, 0.002);
      else if (j == 1) a *= lit(uSpotShadow1, uSpotMatrix1, p, 0.002);
      li += uLColor[j] * a * phase(dot(rd, l));
    }
    acc += li * trans * uDensity * dt;
    trans *= stepT;
    t += dt;
  }
  gl_FragColor = vec4(acc, 1.0);
}`;

export class Volumetrics {
  readonly target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  private material: THREE.ShaderMaterial;
  private quad: FullScreenQuad;

  constructor() {
    this.target.texture.minFilter = this.target.texture.magFilter = THREE.LinearFilter;
    const arr = (n: number) => Array.from({ length: n }, () => new THREE.Vector3());
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDepth: { value: null },
        uProjInv: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() },
        uSteps: { value: 16 },
        uMaxDist: { value: 40 },
        uDensity: { value: 0.03 },
        uAniso: { value: 0.3 },
        uMoonColor: { value: new THREE.Vector3() },
        uMoonDir: { value: new THREE.Vector3() },
        uMoonShadow: { value: ONE },
        uMoonMatrix: { value: new THREE.Matrix4() },
        uLPos: { value: arr(SPOTS) },
        uLDir: { value: arr(SPOTS) },
        uLColor: { value: arr(SPOTS) },
        uLParams: { value: arr(SPOTS) },
        uDecay: { value: 2 },
        uSpotShadow0: { value: ONE },
        uSpotShadow1: { value: ONE },
        uSpotMatrix0: { value: new THREE.Matrix4() },
        uSpotMatrix1: { value: new THREE.Matrix4() },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  /** Its shader compiled ahead, as it's drawn (alone, into its target): turning volumetrics on doesn't stall (PostPipeline.warm). */
  warm(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    // FullScreenQuad's triangle: its attributes (position, uv) are what decides the program.
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3)).setAttribute('uv', new THREE.Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
    renderer.setRenderTarget(this.target);
    renderer.compile(new THREE.Mesh(g, this.material), camera);
    renderer.setRenderTarget(null);
  }

  setSize(w: number, h: number) {
    const d = Math.max(1, VOLUMETRICS.downscale);
    this.target.setSize(Math.max(1, Math.round(w / d)), Math.max(1, Math.round(h / d)));
  }

  render(renderer: THREE.WebGLRenderer, depth: THREE.Texture, camera: THREE.PerspectiveCamera, lighting: Lighting) {
    const u = this.material.uniforms;
    const V = VOLUMETRICS;
    u.tDepth.value = depth;
    u.uProjInv.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    u.uSteps.value = Math.max(1, Math.min(MAX_STEPS, Math.round(V.steps)));
    u.uMaxDist.value = V.maxDistance;
    u.uDensity.value = V.density;
    u.uAniso.value = V.anisotropy;
    u.uDecay.value = ATMOS.lightDecay;

    const moon = lighting.moon;
    const moonMap = moon.castShadow ? moon.shadow.map?.depthTexture : null;
    u.uMoonShadow.value = moonMap ?? ONE;
    u.uMoonMatrix.value.copy(moon.shadow.matrix);
    u.uMoonDir.value.subVectors(moon.position, moon.target.position).normalize();
    u.uMoonColor.value.set(moon.color.r, moon.color.g, moon.color.b).multiplyScalar(moon.intensity * V.moon);

    lighting.scatter.forEach((l, i) => {
      u.uLPos.value[i].copy(l.pos);
      u.uLDir.value[i].copy(l.dir);
      u.uLColor.value[i].set(l.color.r, l.color.g, l.color.b).multiplyScalar(V.lights);
      u.uLParams.value[i].set(Math.max(l.range, 0.01), Math.cos(l.angle), Math.cos(l.angle * (1 - l.penumbra)));
      if (i < 2) {
        u[`uSpotShadow${i}`].value = l.shadow?.shadow.map?.depthTexture ?? ONE;
        if (l.shadow) u[`uSpotMatrix${i}`].value.copy(l.shadow.shadow.matrix);
      }
    });

    renderer.setRenderTarget(this.target);
    this.quad.render(renderer);
  }
}
