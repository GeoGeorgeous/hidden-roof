import { FLICKER } from '../config';

// Flicker shared by the CPU (real light intensity) and the surface shader
// (neon tube emissive). Both use the same integer hash, so a sign's tubes and
// its light dip on exactly the same steps.

/** PCG-style hash of an integer to 0..1 (matches FLICKER_GLSL bit for bit). */
function hash(n: number) {
  let h = (Math.imul(n >>> 0, 747796405) + 2891336453) >>> 0;
  h = Math.imul((h >>> ((h >>> 28) + 4)) ^ h, 277803737) >>> 0;
  h = ((h >>> 22) ^ h) >>> 0;
  return h / 4294967295;
}

/** Brightness 0..1 at time t (s) for a light with this seed (1+). */
function flicker(t: number, seed: number, rate: number, depth: number) {
  const step = Math.floor(t * FLICKER.speed) % 100000;
  const h = hash(step * 131 + seed * 7919);
  if (h < 1 - rate) return 1;
  // Dips vary in depth; a second hash keeps neighbouring dips different.
  return 1 - depth * (0.4 + 0.6 * hash(step * 17 + seed * 31 + 5));
}

export const neonFlicker = (t: number, seed: number) => flicker(t, seed, FLICKER.neonRate, FLICKER.neonDepth) * (1 - FLICKER.neonHum * 0.5 + FLICKER.neonHum * 0.5 * Math.sin(t * 50 + seed));

export const FLICKER_GLSL = /* glsl */ `
uniform float uFlickerSpeed;
uniform float uFlickerRate;
uniform float uFlickerDepth;
uniform float uFlickerHum;
float flickerHash(uint n) {
  uint h = n * 747796405u + 2891336453u;
  h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
  h = (h >> 22u) ^ h;
  return float(h) / 4294967295.0;
}
float neonFlicker(float t, float seed) {
  uint step = uint(mod(floor(t * uFlickerSpeed), 100000.0));
  uint s = uint(seed);
  float f = 1.0;
  if (flickerHash(step * 131u + s * 7919u) >= 1.0 - uFlickerRate) f = 1.0 - uFlickerDepth * (0.4 + 0.6 * flickerHash(step * 17u + s * 31u + 5u));
  return f * (1.0 - uFlickerHum * 0.5 + uFlickerHum * 0.5 * sin(t * 50.0 + seed));
}
`;
