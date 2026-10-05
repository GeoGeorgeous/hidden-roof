/** Small deterministic random sequence (LCG): the same seed always gives the same values in 0..1. */
export function lcg(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/**
 * Random sources for everything that decides paint: Math.random in play, seeded
 * in the golden paint test. One per purpose, so the draws of one never shift
 * another's: drip decisions draw per saturated texel, which depends on the
 * paint detail, while the spray (and can jitter) and the sputter don't.
 */
export const paintRandom: Record<'spray' | 'sputter' | 'drips', () => number> = { spray: Math.random, sputter: Math.random, drips: Math.random };

export function seedPaintRandom(seed: number) {
  paintRandom.spray = lcg(seed * 7919 + 1);
  paintRandom.sputter = lcg(seed * 7919 + 2);
  paintRandom.drips = lcg(seed * 7919 + 3);
}
