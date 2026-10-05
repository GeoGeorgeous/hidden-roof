import * as THREE from 'three';
import { ATMOS, BASE_TEXTURES, FANS, FLICKER, INK, LIGHTMAP, PAINT, SKYLINE } from './config';
import { FLICKER_GLSL } from './render/flicker';
import { TRACK_GLSL, trackUniforms } from './render/cctv-track';
import { BAKE_FRAG, BAKE_FRAG_PARS, BAKE_VERT, BAKE_VERT_PARS, bakeUniforms } from './render/bake/glsl';
import { INK_FRAG, INK_PARS, inkUniforms, syncInkUniforms } from './render/ink/tone';
import { textures, type TexName } from './textures';
import { FACADE_GLSL, type Facade } from './render/ink/facade';
import { GRIME_GLSL } from './render/ink/grime';

export type { TexName } from './textures';

// The one surface material: three's Phong (lights, shadows) with injected
//  - world-aligned base texture tinted per vertex
//  - ink instead of color (render/ink/tone.ts): the lit result becomes paper,
//    hatching or solid ink; distance fades it into paper
//  - the paint atlas layered on top (single paint layer), the only color
//  - wet look on up-facing surfaces (darker + specular)
//  - per-vertex emissive (lamps, neon), facade bands (render/ink/facade.ts)
//    and grime (render/ink/grime.ts)
//  - low clouds: everything above the cloud base fades into INK.cloud
//  - swinging decor (CCTV heads): rotated around a vertical pivot in the vertex
//    shader from per-vertex swing attributes, so it stays in the level batches;
//    CCTV heads also turn to follow a nearby player and light their lens
//  - baked lamp light (render/bake): a lightmap on paintable surfaces, light
//    in the vertices of decor, plus wet highlights from the nearest lamps
//  - build-mode overlay that marks paintable surfaces

const EMPTY_PAINT = new THREE.DataTexture(new Uint8Array(4), 1, 1);
EMPTY_PAINT.needsUpdate = true;
const BLACK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
BLACK.needsUpdate = true;

/** Uniforms shared by every surface; the debug panel edits ATMOS and these follow. */
export const shared = {
  uWet: { value: ATMOS.wetness },
  uEmissiveBoost: { value: ATMOS.emissiveBoost },
  /** Fraction of punched facade windows that are lit (paper). */
  uLitWindows: { value: SKYLINE.litWindows },
  /** Grime on surfaces (render/ink/grime.ts). */
  uGrime: { value: INK.grime },
  uCloudBase: { value: ATMOS.cloudBase },
  uCloudFade: { value: ATMOS.cloudFade },
  uAlphaSteps: { value: PAINT.alphaSteps },
  uTime: { value: 0 },
  uSpin: { value: 0 },
  uFlickerSpeed: { value: FLICKER.speed },
  uFlickerRate: { value: FLICKER.neonRate },
  uFlickerDepth: { value: FLICKER.neonDepth },
  uFlickerHum: { value: FLICKER.neonHum },
  /** Build mode: stripe paintable surfaces, dim everything else. */
  uShowPaintable: { value: 0 },
  /** CCTV tracking: player position and ranges (render/cctv-track.ts). */
  ...trackUniforms,
  /** Baked lamp light and wet highlights (render/bake/glsl.ts). */
  ...bakeUniforms,
  /** Paper, ink and tone steps (render/ink/tone.ts). */
  ...inkUniforms,
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
  shared.uLitWindows.value = SKYLINE.litWindows;
  shared.uGrime.value = INK.grime;
  shared.uCloudBase.value = ATMOS.cloudBase;
  shared.uCloudFade.value = ATMOS.cloudFade;
  shared.uAlphaSteps.value = PAINT.alphaSteps;
  shared.uBakedScale.value = LIGHTMAP.enabled ? ATMOS.practical : 0;
  syncInkUniforms();
}

/**
 * Swing / spin around an axis through the pivot (CCTV heads, AC fans):
 * swing = (amp, speed, phase, axis). amp > 0 swings amp * sin(t * speed + phase);
 * amp < 0 spins continuously at `speed` x uSpin (FANS.speed, rad/s). axis 0 = y, 1 = x, 2 = z.
 * swingTrack = (rest facing x, z, mode): mode 1 turns toward the player when they
 * are near (CCTV heads), mode 2 also lights up meanwhile (the lens).
 */
const SWING_GLSL = /* glsl */ `
attribute vec3 swingPivot;
attribute vec4 swing;
attribute vec3 swingTrack;
uniform float uTime;
uniform float uSpin;
${TRACK_GLSL}
vec3 swingRot(vec3 v) {
  float a = swing.x > 0.0 ? swing.x * sin(uTime * swing.y + swing.z) : mod(uTime * uSpin * swing.y, 6.2831853) + swing.z;
  if (swingTrack.z > 0.5) a = trackAngle(a, swingPivot, swingTrack.xy);
  a *= uMotion;
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
attribute vec4 facade;
uniform float uBaseScale;
${SWING_GLSL}
${FLICKER_GLSL}
${BAKE_VERT_PARS}
varying vec2 vBaseUv;
varying vec2 vPaintUv;
varying vec3 vTint;
varying float vEmissiveV;
varying vec3 vWorldPos;
varying vec3 vWorldN;
varying vec4 vFacade;
`;
const VERT_MAIN = /* glsl */ `
vBaseUv = baseUv * uBaseScale;
vPaintUv = uv;
vTint = tint;
vFacade = facade;
vEmissiveV = flicker > 0.0 ? emissive * neonFlicker(uTime, flicker) : emissive;
if (swingTrack.z > 1.5) vEmissiveV *= trackWeight(swingPivot, swingTrack.xy);
vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWorldN = normalize(mat3(modelMatrix) * objectNormal);
${BAKE_VERT}
`;
const FRAG_PARS = /* glsl */ `
uniform sampler2D uBase;
uniform sampler2D uPaint;
uniform float uAlphaTest;
uniform float uAlphaSteps;
uniform float uWet;
uniform float uEmissiveBoost;
uniform float uCloudBase;
uniform float uCloudFade;
uniform float uShowPaintable;
uniform float uPaintable;
${BAKE_FRAG_PARS}
${INK_PARS}
${FACADE_GLSL}
${GRIME_GLSL}
varying vec4 vFacade;
varying vec2 vBaseUv;
varying vec2 vPaintUv;
varying vec3 vTint;
varying float vEmissiveV;
varying vec3 vWorldPos;
varying vec3 vWorldN;
`;
const FRAG_MAP = /* glsl */ `
vec4 baseTex = texture2D(uBase, vBaseUv);
#ifdef BASE_ALPHA_TEST
if (baseTex.a < uAlphaTest) discard;
#endif
float wet = smoothstep(0.5, 0.9, vWorldN.y) * uWet;
vec3 baseCol = mix(baseTex.rgb * vTint, vec3(0.002), facadeInk(vFacade, vWorldPos, vWorldN)) * mix(1.0, 0.55, wet);
vec4 paintTex = texture2D(uPaint, vPaintUv);
float pa = paintTex.a;
if (uAlphaSteps > 0.0) pa = ceil(pa * uAlphaSteps - 0.15) / uAlphaSteps;
pa = clamp(pa, 0.0, 1.0);
diffuseColor.rgb *= baseCol;
float hiStripe = step(0.5, fract((vWorldPos.x + vWorldPos.y + vWorldPos.z) * 1.25));
`;
const FRAG_SPECULAR = /* glsl */ `
float specularStrength = wet * (1.0 - 0.6 * pa);
`;
const FRAG_EMISSIVE = /* glsl */ `
totalEmissiveRadiance += diffuseColor.rgb * vEmissiveV * uEmissiveBoost;
`;

export interface SurfaceMaterialOptions {
  tex: TexName;
  /** Meters covered by one repeat of the base texture. */
  tileMeters?: number;
  /** Discard texels whose base alpha is below this (chain-link etc). */
  alphaTest?: number;
}

export class SurfaceMaterial extends THREE.MeshPhongMaterial {
  /** The base texture (opaque draws are grouped by it, see render/post.ts). */
  readonly baseTexture: THREE.Texture;
  private paintUniform = { value: EMPTY_PAINT as THREE.Texture };
  private paintableUniform = { value: 0 };
  private baseScaleUniform = { value: 1 };
  private lightUniform = { value: BLACK as THREE.Texture };
  private lightFlickerUniform = { value: BLACK as THREE.Texture };
  private lightFlickerOnUniform = { value: 0 };

  constructor(opts: SurfaceMaterialOptions) {
    super({ color: '#ffffff', specular: '#c8d4e8', shininess: 48 });
    // Only alpha-tested materials (chain-link) get a shader with `discard`: in
    // the one every other surface shares, it can slow the GPU's depth test.
    if (opts.alphaTest) this.defines = { BASE_ALPHA_TEST: '' };
    // Sign lettering (glyph and word atlases) is drawn straight from the texture, not lit (render/ink/tone.ts).
    if (opts.tex === 'signs' || opts.tex === 'words' || opts.tex === 'neon') this.defines = { ...this.defines, LETTERS: '' };
    const base = (this.baseTexture = textures()[opts.tex]);
    const tile = opts.tileMeters ?? (base.image as HTMLCanvasElement).width / BASE_TEXTURES.texelsPerMeter;
    this.baseScaleUniform.value = 1 / tile;
    const own = {
      uBase: { value: base },
      uPaint: this.paintUniform,
      uBaseScale: this.baseScaleUniform,
      uAlphaTest: { value: opts.alphaTest ?? 0 },
      uPaintable: this.paintableUniform,
      uLightmap: this.lightUniform,
      uLightFlicker: this.lightFlickerUniform,
      uLightFlickerOn: this.lightFlickerOnUniform,
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
        .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>\n${BAKE_FRAG}`)
        .replace('#include <opaque_fragment>', INK_FRAG)
        .replace('#include <fog_fragment>', '');
    };
  }

  /** All surfaces share one program (alpha-tested ones and lettering their own, by their define); only uniforms differ. */
  customProgramCacheKey() {
    return 'surface-ink-2';
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

  /** Baked lamp light of a paintable surface (render/bake), and its neon flicker layer; null = none. */
  setLightmap(light: THREE.Texture | null, flicker: THREE.Texture | null) {
    this.lightUniform.value = light ?? BLACK;
    this.lightFlickerUniform.value = flicker ?? BLACK;
    this.lightFlickerOnUniform.value = flicker ? 1 : 0;
  }
}

export function makeSurfaceMaterial(opts: SurfaceMaterialOptions) {
  return new SurfaceMaterial(opts);
}

/** Every geometry drawn with the surface material needs per-vertex tint + emissive (and a facade, default plain). */
export function tintGeometry(g: THREE.BufferGeometry, color: THREE.ColorRepresentation = '#ffffff', emissive = 0, flickerSeed = 0, facade?: Facade) {
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
  if (facade) setFacade(g, facade);
  return swingGeometry(g);
}

/** Give every vertex of a geometry the same facade pattern. */
export function setFacade(g: THREE.BufferGeometry, facade: Facade) {
  const n = g.attributes.position.count;
  const f = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) f.set(facade, i * 4);
  g.setAttribute('facade', new THREE.BufferAttribute(f, 4));
}

/** Per-vertex baked lamp light (decor), copied into the batches after a rebake. */
export const BAKED_ATTRIBUTES = ['baked', 'bakedFlicker'] as const;

/**
 * Per-vertex swing attributes (see SWING_GLSL). Every decor geometry gets them,
 * zero by default, so moving and still decor merge into the same batches.
 * Paint meshes get them too (always still), plus a zero flicker. Both also get
 * the baked-light attributes (render/bake), zero until the first bake.
 */
export function swingGeometry(g: THREE.BufferGeometry, pivot?: THREE.Vector3, amp = 0, speed = 0, phase = 0, axis = 0, track?: [number, number, number]) {
  const n = g.attributes.position.count;
  const pv = new Float32Array(n * 3);
  const sw = new Float32Array(n * 4);
  const tr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    if (pivot) pv.set([pivot.x, pivot.y, pivot.z], i * 3);
    sw.set([amp, speed, phase, axis], i * 4);
    if (track) tr.set(track, i * 3);
  }
  g.setAttribute('swingPivot', new THREE.BufferAttribute(pv, 3));
  g.setAttribute('swing', new THREE.BufferAttribute(sw, 4));
  g.setAttribute('swingTrack', new THREE.BufferAttribute(tr, 3));
  if (!g.attributes.flicker) g.setAttribute('flicker', new THREE.BufferAttribute(new Float32Array(n), 1));
  if (!g.attributes.facade) g.setAttribute('facade', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
  if (!g.attributes.lightUv) {
    g.setAttribute('lightUv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    g.setAttribute('baked', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('bakedFlicker', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
  }
  return g;
}

/** Shadow-pass material for decor batches: same swing as the surface shader. */
export const swingDepthMaterial = new THREE.MeshDepthMaterial();
swingDepthMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.uTime = shared.uTime;
  shader.uniforms.uSpin = shared.uSpin;
  Object.assign(shader.uniforms, trackUniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${SWING_GLSL}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${SWING_POSITION}`);
};
