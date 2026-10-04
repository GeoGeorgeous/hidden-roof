// Tools whose size the mouse wheel changes (marker nib, sponge patch): their
// config holds the size and its wheel range, and the crosshair grows with it.

export interface WheelSized {
  radius: number;
  radiusMin: number;
  radiusMax: number;
  radiusStep: number;
  crosshair: number;
  crosshairPerMeter: number;
}

/** One wheel notch: grow (+1) or shrink (-1) `radius` by radiusStep, within min..max. False if already at the limit. */
export function stepSize(cfg: WheelSized, dir: number) {
  const r = Math.min(cfg.radiusMax, Math.max(cfg.radiusMin, cfg.radius + dir * cfg.radiusStep));
  const changed = Math.abs(r - cfg.radius) > 1e-9;
  cfg.radius = Math.round(r * 1e6) / 1e6;
  return changed;
}

/** Crosshair size (px) that follows the size. */
export function sizedCrosshair(cfg: WheelSized) {
  return Math.round(cfg.crosshair + cfg.radius * cfg.crosshairPerMeter);
}
