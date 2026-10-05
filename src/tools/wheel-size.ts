// Tools whose size the mouse wheel changes (marker nib, sponge patch): their
// config holds the starting size (`radius`) and the wheel's range, each player
// holds their current size (Inventory.size), and the crosshair grows with it.

export interface WheelSized {
  radiusMin: number;
  radiusMax: number;
  radiusStep: number;
  crosshair: number;
  crosshairPerMeter: number;
}

/** One wheel notch: `size` grown (+1) or shrunk (-1) by radiusStep, within min..max. */
export function stepSize(cfg: WheelSized, size: number, dir: number) {
  const r = Math.min(cfg.radiusMax, Math.max(cfg.radiusMin, size + dir * cfg.radiusStep));
  return Math.round(r * 1e6) / 1e6;
}

/** Crosshair size (px) that follows the size. */
export function sizedCrosshair(cfg: WheelSized, size: number) {
  return Math.round(cfg.crosshair + size * cfg.crosshairPerMeter);
}
