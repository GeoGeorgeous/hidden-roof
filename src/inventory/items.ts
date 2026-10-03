import { CAP_ORDER, CAPS, COLOR_ORDER, COLORS, SIZE_ORDER, type CanSize, type CapId, type PaintColor } from '../config';

// Pickup kinds as stored in level JSON:
//   "color:red"     unlock a paint color (can + marker)
//   "can:md"        upgrade the can to md / lg
//   "cap:fat"       unlock a cap
//   "marker"        the marker (slot 2)

export type PickupKind = string;

export type PickupContent = { color: PaintColor } | { size: CanSize } | { cap: CapId } | { marker: true };

export const PICKUP_KINDS: PickupKind[] = [
  ...COLOR_ORDER.filter((c) => c !== 'black').map((c) => `color:${c}`),
  ...SIZE_ORDER.filter((s) => s !== 'sm').map((s) => `can:${s}`),
  ...CAP_ORDER.map((c) => `cap:${c}`),
  'marker',
];

export function parsePickup(kind: PickupKind): PickupContent | null {
  const [k, a] = kind.split(':');
  if (k === 'marker') return { marker: true };
  if (k === 'color' && COLOR_ORDER.includes(a as PaintColor)) return { color: a as PaintColor };
  if (k === 'can' && SIZE_ORDER.includes(a as CanSize)) return { size: a as CanSize };
  if (k === 'cap' && a in CAPS) return { cap: a as CapId };
  return null;
}

export function pickupLabel(kind: PickupKind) {
  const c = parsePickup(kind);
  if (!c) return kind;
  if ('color' in c) return `${c.color} paint`;
  if ('size' in c) return `${c.size} can upgrade`;
  if ('cap' in c) return `${CAPS[c.cap].name.toLowerCase()} cap`;
  return 'marker';
}

/** Hex color to sRGB 0..1 (what paint textures store). */
export function srgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const rgbCache = new Map<string, [number, number, number]>();
/** A paint color as 0..1 sRGB, the way both tools stamp it. */
export function rgbOf(color: PaintColor) {
  let c = rgbCache.get(color);
  if (!c) rgbCache.set(color, (c = srgb01(COLORS[color])));
  return c;
}
