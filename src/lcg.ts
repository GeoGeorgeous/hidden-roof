/** Small deterministic random sequence (LCG): the same seed always gives the same values in 0..1. */
export function lcg(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Random source for everything that decides paint (spray, sputter, drips): Math.random in play, seeded in the golden paint test. */
export let paintRandom: () => number = Math.random;

export function seedPaintRandom(seed: number) {
  paintRandom = lcg(seed);
}
