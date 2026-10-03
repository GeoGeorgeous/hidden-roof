import { V_MODULE } from '../kit/def';

// Logical levels: the map sits on top of a skyscraper, so heights are counted
// in levels from a baseline instead of in meters. Level 0 is the main roof
// (y = 0); level n is n vertical modules (4 m) above it, level -1 is one below.
// Level JSON still stores meters relative to level 0 (y = level * 4).

export const LEVEL_HEIGHT = V_MODULE;

/** World height of a level's floor. */
export const levelY = (n: number) => n * LEVEL_HEIGHT;

/** The level a height belongs to (a floor at y = 8 is level 2, so is anything standing on it). */
export const levelOf = (y: number) => Math.floor((y + 0.01) / LEVEL_HEIGHT);

/** "LEVEL 2", or "LEVEL 1 +1.2 M" for things between floors. */
export function describeHeight(y: number) {
  const n = levelOf(y);
  const off = y - levelY(n);
  return off < 0.05 ? `LEVEL ${n}` : `LEVEL ${n} +${off.toFixed(1)} M`;
}
