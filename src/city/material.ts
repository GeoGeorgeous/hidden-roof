import * as THREE from 'three';
import { SKYLINE } from '../config';
import { moonDirection } from '../render/moon';
import { shared } from '../materials';
import { INK_PARS, inkUniforms } from '../render/ink/tone';
import { FACADE_GLSL } from '../render/ink/facade';
import { GRIME_GLSL } from '../render/ink/grime';
import { cityTextAtlas } from '../render/ink/city-text';
import type { Lighting } from '../render/lighting';

// The city's own ink material: the same tones, hatching, facades and grime
// as the surface material (render/ink), lit the same way by the moon and the
// sky, but nothing the city never uses: no paint, baked lamps, spot lights,
// shadows or swinging parts. Towers cover most of the screen, so this is
// where most pixels are shaded; it costs a fraction of the full surface
// shader. Signs use it with the city text atlas (`lettering`).
// SKYLINE.opacity fades the whole city into the sky color, to put the focus
// on the level: the towers stay solid (no see-through), and the fade goes in
// the alpha channel so the final pass thins the city's outlines to match.

/** Moon and sky light, in the units the surface shader's inkLight() returns. */
const light = {
  uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
  uMoonLight: { value: 1 },
  uSkyLight: { value: 0.3 },
  uGroundLight: { value: 0 },
};

/** Shared with the city's pen lines (city/lines.ts). */
export const cityUniforms = {
  /** SKYLINE.opacity: 1 = drawn in full, 0 = gone into the sky color. */
  uCityOpacity: { value: 1 },
};

const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/** Per frame, after Lighting.update: follow the moon, sky and lightning, and SKYLINE.opacity. */
export function syncCityLight(lighting: Lighting) {
  cityUniforms.uCityOpacity.value = SKYLINE.opacity;
  moonDirection(light.uMoonDir.value);
  light.uMoonLight.value = lum(lighting.moon.color) * lighting.moon.intensity;
  light.uSkyLight.value = lum(lighting.hemi.color) * lighting.hemi.intensity;
  light.uGroundLight.value = lum(lighting.hemi.groundColor) * lighting.hemi.intensity;
}

const vertexShader = /* glsl */ `
attribute vec3 tint;
attribute vec4 facade;
#ifdef LETTERING
attribute vec2 baseUv;
varying vec2 vUv;
#endif
varying vec3 vWorldPos;
varying vec3 vWorldN;
varying vec3 vTint;
varying vec4 vFacade;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldN = normalize(mat3(modelMatrix) * normal);
  vTint = tint;
  vFacade = facade;
#ifdef LETTERING
  vUv = baseUv;
#endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const fragmentShader = /* glsl */ `
#include <common>
uniform vec3 uMoonDir;
uniform float uMoonLight;
uniform float uSkyLight;
uniform float uGroundLight;
uniform float uCloudBase;
uniform float uCloudFade;
uniform float uCityOpacity;
uniform vec3 uSky;
#ifdef LETTERING
uniform sampler2D uLetters;
varying vec2 vUv;
#endif
${INK_PARS}
${FACADE_GLSL}
${GRIME_GLSL}
varying vec3 vWorldPos;
varying vec3 vWorldN;
varying vec3 vTint;
varying vec4 vFacade;
void main() {
  vec3 n = normalize(vWorldN);
  vec3 albedo = vTint;
#ifdef LETTERING
  albedo *= texture2D(uLetters, vUv).rgb;
#endif
  albedo = mix(albedo, vec3(0.002), facadeInk(vFacade, vWorldPos, n));
  float light = uMoonLight * max(dot(n, uMoonDir), 0.0) + mix(uGroundLight, uSkyLight, 0.5 + 0.5 * n.y);
  float tone = inkTone(albedo, light, vec3(0.0), vec3(0.0), vWorldPos);
  vec2 hatch = inkHatches(vWorldPos, n);
  vec4 grime = inkGrime(vWorldPos, n, 1.0 - step(0.5, vFacade.x));
  float dirt = max(hatch.y * grime.x, grime.w);
  float keep = inkKeep(vWorldPos);
  vec3 col = mix(uPaper, uInkColor, max(inkCover(inkFade(tone, keep), hatch, vWorldPos), dirt * smoothstep(0.35, 0.65, keep)));
  col = mix(col, uCloudInk, inkCloud(vWorldPos, uCloudBase, uCloudFade));
  // Alpha carries the opacity to the final pass (outline strength); the material doesn't blend.
  gl_FragColor = vec4(mix(uSky, col, uCityOpacity), uCityOpacity);
}`;

export function cityMaterial(lettering = false) {
  return new THREE.ShaderMaterial({
    defines: lettering ? { LETTERING: '' } : {},
    uniforms: {
      ...inkUniforms,
      ...light,
      ...cityUniforms,
      uCloudBase: shared.uCloudBase,
      uCloudFade: shared.uCloudFade,
      uLitWindows: shared.uLitWindows,
      uGrime: shared.uGrime,
      uLetters: { value: cityTextAtlas() },
    },
    vertexShader,
    fragmentShader,
  });
}
