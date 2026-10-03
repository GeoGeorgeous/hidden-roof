import * as THREE from 'three';
import { ATMOS, FANS, FLICKER, PAINT } from './config';
import { FLICKER_GLSL } from './render/flicker';
import { glowFor, textures, type TexName } from './textures';

export type { TexName } from './textures';

// The one surface material: three's Phong (lights, shadows, fog) with injected
//  - world-aligned base texture tinted per vertex
//  - the paint atlas layered on top (single paint layer)
//  - wet look on up-facing surfaces (darker + specular)
//  - per-vertex emissive (lamps, neon) and window glow masks (skyline)
//  - low clouds: everything above the cloud base fades into the cloud color
//  - swinging decor (CCTV heads): rotated around a vertical pivot in the vertex
//    shader from per-vertex swing attributes, so it stays in the level batches
//  - build-mode overlay that marks paintable surfaces

const EMPTY_PAINT = new THREE.DataTexture(new Uint8Array(4), 1, 1);
EMPTY_PAINT.needsUpdate = true;
const BLACK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
BLACK.needsUpdate = true;

/** Uniforms shared by every surface; the debug panel edits ATMOS and these follow. */
export const shared = {
  uWet: { value: ATMOS.wetness },
  uEmissiveBoost: { value: ATMOS.emissiveBoost },
  uGlowStrength: { value: ATMOS.windowGlow },
  uPaintGlow: { value: ATMOS.paintGlow },
  uCloudBase: { value: ATMOS.cloudBase },
  uCloudFade: { value: ATMOS.cloudFade },
  uCloudColor: { value: new THREE.Color(ATMOS.cloudColor) },
  uAlphaSteps: { value: PAINT.alphaSteps },
  uTime: { value: 0 },
  uSpin: { value: 0 },
  uFlickerSpeed: { value: FLICKER.speed },
  uFlickerRate: { value: FLICKER.neonRate },
  uFlickerDepth: { value: FLICKER.neonDepth },
  uFlickerHum: { value: FLICKER.neonHum },
  /** Build mode: stripe paintable surfaces, dim everything else. */
  uShowPaintable: { value: 0 },
};

export function syncSharedUniforms(time: number) {
  shared.uTime.value = time;
  shared.uSpin.value = FANS.speed * Math.PI * 2;
  shared.uFlickerSpeed.value = FLICKER.speed;
  shared.uFlickerRate.value = FLICKER.neonRate;
  shared.uFlickerDepth.value = FLICKER.neonDepth;
  shared.uFlickerHum.value = FLICKER.neonHum;
  shared.uWet.value = ATMOS.wetness;
  shared.uEmissiveBoost.value = ATMOS.emissiveBoost;
  shared.uGlowStrength.value = ATMOS.windowGlow;
  shared.uPaintGlow.value = ATMOS.paintGlow;
  shared.uCloudBase.value = ATMOS.cloudBase;
  shared.uCloudFade.value = ATMOS.cloudFade;
  shared.uAlphaSteps.value = PAINT.alphaSteps;
}

/**
 * Swing / spin around an axis through the pivot (CCTV heads, AC fans):
 * swing = (amp, speed, phase, axis). amp > 0 swings amp * sin(t * speed + phase);
 * amp < 0 spins continuously at `speed` x uSpin (FANS.speed, rad/s). axis 0 = y, 1 = x, 2 = z.
 */
const SWING_GLSL = /* glsl */ `
attribute vec3 swingPivot;
attribute vec4 swing;
uniform float uTime;
uniform float uSpin;
vec3 swingRot(vec3 v) {
  float a = swing.x > 0.0 ? swing.x * sin(uTime * swing.y + swing.z) : mod(uTime * uSpin * swing.y, 6.2831853) + swing.z;
  float c = cos(a), s = sin(a);
  if (swing.w > 1.5) return vec3(c * v.x - s * v.y, s * v.x + c * v.y, v.z);
  if (swing.w > 0.5) return vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z);
  return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
}
`;
const SWING_NORMAL = 'objectNormal = swingRot(objectNormal);';
const SWING_POSITION = 'if (swing.x != 0.0) transformed = swingPivot + swingRot(transformed - swingPivot);';

const VERT_PARS = /* glsl */ `
attribute vec2 baseUv;
attribute vec3 tint;
attribute float emissive;
attribute float flicker;
uniform float uBaseScale;
${SWING_GLSL}
${FLICKER_GLSL}
varying vec2 vBaseUv;
varying vec2 vPaintUv;
varying vec3 vTint;
varying float vEmissiveV;
varying vec3 vWorldPos;
varying vec3 vWorldN;
`;
const VERT_MAIN = /* glsl */ `
vBaseUv = baseUv * uBaseScale;
vPaintUv = uv;
vTint = tint;
vEmissiveV = flicker > 0.0 ? emissive * neonFlicker(uTime, flicker) : emissive;
vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWorldN = normalize(mat3(modelMatrix) * objectNormal);
`;
const FRAG_PARS = /* glsl */ `
uniform sampler2D uBase;
uniform sampler2D uPaint;
uniform sampler2D uGlow;
uniform float uAlphaTest;
uniform float uAlphaSteps;
uniform float uWet;
uniform float uEmissiveBoost;
uniform float uGlowStrength;
uniform float uPaintGlow;
uniform float uCloudBase;
uniform float uCloudFade;
uniform vec3 uCloudColor;
uniform float uShowPaintable;
uniform float uPaintable;
varying vec2 vBaseUv;
varying vec2 vPaintUv;
varying vec3 vTint;
varying float vEmissiveV;
varying vec3 vWorldPos;
varying vec3 vWorldN;
`;
const FRAG_MAP = /* glsl */ `
vec4 baseTex = texture2D(uBase, vBaseUv);
if (baseTex.a < uAlphaTest) discard;
float wet = smoothstep(0.5, 0.9, vWorldN.y) * uWet;
vec3 baseCol = baseTex.rgb * vTint * mix(1.0, 0.55, wet);
vec4 paintTex = texture2D(uPaint, vPaintUv);
float pa = paintTex.a;
if (uAlphaSteps > 0.0) pa = ceil(pa * uAlphaSteps - 0.15) / uAlphaSteps;
pa = clamp(pa, 0.0, 1.0);
diffuseColor.rgb *= mix(baseCol, paintTex.rgb, pa);
float hiStripe = 0.0;
if (uShowPaintable > 0.5) {
  if (uPaintable > 0.5) {
    hiStripe = step(0.5, fract((vWorldPos.x + vWorldPos.y + vWorldPos.z) * 1.25));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.15, 1.0, 0.55), 0.4 + 0.25 * hiStripe);
  } else {
    diffuseColor.rgb *= 0.3;
  }
}
`;
const FRAG_SPECULAR = /* glsl */ `
float specularStrength = wet * (1.0 - 0.6 * pa);
`;
const FRAG_EMISSIVE = /* glsl */ `
totalEmissiveRadiance += diffuseColor.rgb * vEmissiveV * uEmissiveBoost;
totalEmissiveRadiance += texture2D(uGlow, vBaseUv).rgb * uGlowStrength;
totalEmissiveRadiance += paintTex.rgb * pa * uPaintGlow;
if (uShowPaintable > 0.5 && uPaintable > 0.5) totalEmissiveRadiance += vec3(0.03, 0.2, 0.1) * (1.0 + hiStripe);
`;
const FRAG_FOG = /* glsl */ `
#include <fog_fragment>
gl_FragColor.rgb = mix(gl_FragColor.rgb, uCloudColor, smoothstep(uCloudBase, uCloudBase + uCloudFade, vWorldPos.y));
`;

export interface SurfaceMaterialOptions {
  tex: TexName;
  /** Meters covered by one repeat of the base texture. */
  tileMeters?: number;
  /** Discard texels whose base alpha is below this (chain-link etc). */
  alphaTest?: number;
}

export class SurfaceMaterial extends THREE.MeshPhongMaterial {
  private paintUniform = { value: EMPTY_PAINT as THREE.Texture };
  private paintableUniform = { value: 0 };
  private baseScaleUniform = { value: 1 };

  constructor(opts: SurfaceMaterialOptions) {
    super({ color: '#ffffff', specular: '#c8d4e8', shininess: 48 });
    const base = textures()[opts.tex];
    const tile = opts.tileMeters ?? (base.image as HTMLCanvasElement).width / PAINT.texelsPerMeter;
    this.baseScaleUniform.value = 1 / tile;
    const own = {
      uBase: { value: base },
      uPaint: this.paintUniform,
      uGlow: { value: glowFor(opts.tex) ?? BLACK },
      uBaseScale: this.baseScaleUniform,
      uAlphaTest: { value: opts.alphaTest ?? 0 },
      uPaintable: this.paintableUniform,
    };
    this.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, shared, own);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${SWING_NORMAL}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${SWING_POSITION}\n${VERT_MAIN}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
        .replace('#include <map_fragment>', FRAG_MAP)
        .replace('#include <specularmap_fragment>', FRAG_SPECULAR)
        .replace('#include <emissivemap_fragment>', FRAG_EMISSIVE)
        .replace('#include <fog_fragment>', FRAG_FOG);
    };
  }

  /** All surfaces share one program; only uniforms differ. */
  customProgramCacheKey() {
    return 'surface-v4';
  }

  /** Meters covered by one repeat of the base texture (live). */
  setTileMeters(m: number) {
    this.baseScaleUniform.value = 1 / Math.max(0.01, m);
  }

  /** Marks the material of a paintable mesh (for the build-mode overlay). */
  setPaintable(on: boolean) {
    this.paintableUniform.value = on ? 1 : 0;
  }

  setPaint(t: THREE.Texture) {
    this.paintUniform.value = t;
  }
}

export function makeSurfaceMaterial(opts: SurfaceMaterialOptions) {
  return new SurfaceMaterial(opts);
}

/** Every geometry drawn with the surface material needs per-vertex tint + emissive. */
export function tintGeometry(g: THREE.BufferGeometry, color: THREE.ColorRepresentation = '#ffffff', emissive = 0, flickerSeed = 0) {
  const n = g.attributes.position.count;
  const c = new THREE.Color(color);
  const t = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    t[i * 3] = c.r;
    t[i * 3 + 1] = c.g;
    t[i * 3 + 2] = c.b;
  }
  g.setAttribute('tint', new THREE.BufferAttribute(t, 3));
  g.setAttribute('emissive', new THREE.BufferAttribute(new Float32Array(n).fill(emissive), 1));
  if (!g.attributes.baseUv) g.setAttribute('baseUv', g.attributes.uv.clone());
  g.setAttribute('flicker', new THREE.BufferAttribute(new Float32Array(n).fill(flickerSeed), 1));
  return swingGeometry(g);
}

/**
 * Per-vertex swing attributes (see SWING_GLSL). Every decor geometry gets them,
 * zero by default, so moving and still decor merge into the same batches.
 * Paint meshes get them too (always still), plus a zero flicker.
 */
export function swingGeometry(g: THREE.BufferGeometry, pivot?: THREE.Vector3, amp = 0, speed = 0, phase = 0, axis = 0) {
  const n = g.attributes.position.count;
  const pv = new Float32Array(n * 3);
  const sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    if (pivot) pv.set([pivot.x, pivot.y, pivot.z], i * 3);
    sw.set([amp, speed, phase, axis], i * 4);
  }
  g.setAttribute('swingPivot', new THREE.BufferAttribute(pv, 3));
  g.setAttribute('swing', new THREE.BufferAttribute(sw, 4));
  if (!g.attributes.flicker) g.setAttribute('flicker', new THREE.BufferAttribute(new Float32Array(n), 1));
  return g;
}

/** Shadow-pass material for decor batches: same swing as the surface shader. */
export const swingDepthMaterial = new THREE.MeshDepthMaterial();
swingDepthMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = shared.uTime;
  shader.uniforms.uSpin = shared.uSpin;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${SWING_GLSL}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${SWING_POSITION}`);
};
