/** Small deterministic random sequence (LCG): the same seed always gives the same values in 0..1. */
export function lcg(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/**
 * The random source of everything that decides paint: Math.random in play,
 * seeded in the golden paint test. One per purpose, so the draws of one would
 * never shift another's.
 */
export const paintRandom: Record<'drips', () => number> = { drips: Math.random };

export function seedPaintRandom(seed: number) {
  paintRandom.drips = lcg(seed * 7919 + 3);
}
