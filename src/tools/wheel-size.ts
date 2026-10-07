// Tools whose size the mouse wheel changes (marker nib, sponge patch): their
// config holds the starting width and the wheel's range, each player holds
// their current width (Inventory.size), and the crosshair grows with it.

export interface WheelSized {
  widthMin: number;
  widthMax: number;
  widthStep: number;
  crosshair: number;
  crosshairPerMeter: number;
}

/** One wheel notch: `size` grown (+1) or shrunk (-1) by widthStep, within min..max. */
export function stepSize(cfg: WheelSized, size: number, dir: number) {
  const r = Math.min(cfg.widthMax, Math.max(cfg.widthMin, size + dir * cfg.widthStep));
  return Math.round(r * 1e6) / 1e6;
}

/** Crosshair size (px) that follows the size. */
export function sizedCrosshair(cfg: WheelSized, size: number) {
  return Math.round(cfg.crosshair + size * cfg.crosshairPerMeter);
}
