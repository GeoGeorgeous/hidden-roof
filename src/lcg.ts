/** Small deterministic random sequence (LCG): the same seed always gives the same values in 0..1. */
export function lcg(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
