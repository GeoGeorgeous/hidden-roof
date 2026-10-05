import * as THREE from 'three';

// Colored lamp light (LIGHTS[kind].tint): only part of a lamp's hue reaches
// the walls; the rest of its color is its brightness as a gray.

/** Rec. 709 luminance weights (linear RGB). */
const LUM_WEIGHTS = [0.2126, 0.7152, 0.0722] as const;
/** The same weights as a GLSL vec3. */
export const LUM_GLSL = `vec3(${LUM_WEIGHTS.join(', ')})`;

/** `color` keeping `tint` (0..1) of its hue at the same brightness, into `out`. */
export function tinted(color: THREE.Color, tint: number, out = new THREE.Color()) {
  const lum = LUM_WEIGHTS[0] * color.r + LUM_WEIGHTS[1] * color.g + LUM_WEIGHTS[2] * color.b;
  return out.setRGB(lum + (color.r - lum) * tint, lum + (color.g - lum) * tint, lum + (color.b - lum) * tint);
}
