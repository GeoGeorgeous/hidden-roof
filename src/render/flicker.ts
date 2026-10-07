import { FLICKER } from '../config';

// Flicker shared by the CPU (real light intensity) and the surface shader
// (neon tube emissive). Both use the same integer hash, so a sign's tubes and
// its light dip on exactly the same steps. A flicker value of BROKEN and up is
// a failing lamp (deep, frequent dips); a negative one is a slow pulse
// (aviation lights); the same in both too.

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

/** Flicker values from here up are broken lamps (seed = value - BROKEN), below it neon signs. */
export const BROKEN = 50000;

const neonFlicker = (t: number, seed: number) => flicker(t, seed, FLICKER.neonRate, FLICKER.neonDepth) * (1 - FLICKER.neonHum * 0.5 + FLICKER.neonHum * 0.5 * Math.sin(t * 50 + seed));

/** Slow pulse, brightest at whole multiples of 1 / FLICKER.pulseRate (plus `phase` turns). */
const lightPulse = (t: number, phase: number) => 1 - FLICKER.pulseDepth * (0.5 - 0.5 * Math.cos((t * FLICKER.pulseRate + phase) * Math.PI * 2));

/** Brightness 0..1 at time t of a lamp with this flicker value (Mat.flicker, LightPiece.flicker): 0 steady, 1+ a neon's flicker seed, BROKEN + seed a failing lamp, below 0 a pulse (-1 - phase). */
export const lampLevel = (t: number, f: number) => (f >= BROKEN ? flicker(t, f - BROKEN, FLICKER.brokenRate, FLICKER.brokenDepth) : f > 0 ? neonFlicker(t, f) : f < 0 ? lightPulse(t, -1 - f) : 1);

const BROKEN_GLSL = BROKEN.toFixed(1);

export const FLICKER_GLSL = /* glsl */ `
uniform float uFlickerSpeed;
uniform float uFlickerRate;
uniform float uFlickerDepth;
uniform float uFlickerHum;
uniform float uPulseRate;
uniform float uPulseDepth;
uniform float uBrokenRate;
uniform float uBrokenDepth;
float flickerHash(uint n) {
  uint h = n * 747796405u + 2891336453u;
  h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
  h = (h >> 22u) ^ h;
  return float(h) / 4294967295.0;
}
float flickerDip(float t, float seed, float rate, float depth) {
  uint step = uint(mod(floor(t * uFlickerSpeed), 100000.0));
  uint s = uint(seed);
  if (flickerHash(step * 131u + s * 7919u) < 1.0 - rate) return 1.0;
  return 1.0 - depth * (0.4 + 0.6 * flickerHash(step * 17u + s * 31u + 5u));
}
float neonFlicker(float t, float seed) {
  return flickerDip(t, seed, uFlickerRate, uFlickerDepth) * (1.0 - uFlickerHum * 0.5 + uFlickerHum * 0.5 * sin(t * 50.0 + seed));
}
float lampLevel(float t, float f) {
  if (f >= ${BROKEN_GLSL}) return flickerDip(t, f - ${BROKEN_GLSL}, uBrokenRate, uBrokenDepth);
  if (f > 0.0) return neonFlicker(t, f);
  if (f < 0.0) return 1.0 - uPulseDepth * (0.5 - 0.5 * cos((t * uPulseRate - 1.0 - f) * 6.2831853));
  return 1.0;
}
`;
