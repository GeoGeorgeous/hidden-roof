import { CAP_ORDER, CAPS, COLOR_ORDER, COLORS, type CapId, type PaintColor } from '../config';
import { SLOTS, type Tool } from './inventory';
import type { Rgb } from '../painting';

// Pickup kinds as stored in level JSON:
//   "color:red"     unlock a paint color (can, marker, roller)
//   "cap:fat"       unlock a cap
//   "marker"        the marker (slot 2)
//   "ladder"        the stepladder (slot 3)
//   "roller"        the paint roller (slot 4)
//   "sponge"        the sponge (slot 5)
// (A tool's pickup kind is its name in SLOTS.)

export type PickupKind = string;

export type PickupContent = { color: PaintColor } | { cap: CapId } | { tool: Tool };

/** Tools you find as pickups (the can you always have), and what a pickup calls them. */
const FOUND_TOOLS: Tool[] = SLOTS.filter((t) => t !== 'can');
const TOOL_LABEL: Record<Tool, string> = { can: 'spray can', marker: 'marker', ladder: 'stepladder', roller: 'paint roller', sponge: 'sponge' };

const PICKUP_KINDS: PickupKind[] = [...COLOR_ORDER.filter((c) => c !== 'black').map((c) => `color:${c}`), ...CAP_ORDER.map((c) => `cap:${c}`), ...FOUND_TOOLS];

export function parsePickup(kind: PickupKind): PickupContent | null {
  const [k, a] = kind.split(':');
  if (FOUND_TOOLS.includes(k as Tool) && a === undefined) return { tool: k as Tool };
  if (k === 'color' && COLOR_ORDER.includes(a as PaintColor)) return { color: a as PaintColor };
  if (k === 'cap' && a in CAPS) return { cap: a as CapId };
  return null;
}

export function pickupLabel(kind: PickupKind) {
  const c = parsePickup(kind);
  if (!c) return kind;
  if ('color' in c) return `${c.color} paint`;
  if ('cap' in c) return `${CAPS[c.cap].name.toLowerCase()} cap`;
  return TOOL_LABEL[c.tool];
}

/** A pickup within its build picker group: the group, its name there and, for paint, its color. */
export function pickupVariant(kind: PickupKind) {
  const c = parsePickup(kind)!;
  if ('color' in c) return { group: 'Paint', label: c.color, swatch: COLORS[c.color] };
  if ('cap' in c) return { group: 'Cap', label: CAPS[c.cap].name.toLowerCase() };
  return { group: 'Tool', label: TOOL_LABEL[c.tool] };
}

/** Pickups by what they give, as the build picker shows them: one entry per group, its kinds as variants. */
export const PICKUP_GROUPS = ['Paint', 'Cap', 'Tool'].map((label) => ({ label, kinds: PICKUP_KINDS.map((kind) => ({ kind, ...pickupVariant(kind) })).filter((k) => k.group === label) }));

/** Hex color to sRGB 0..1 (what paint textures store). */
function srgb01(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const rgbCache = new Map<string, Rgb>();
/** A paint color as 0..1 sRGB, the way every tool paints it. */
export function rgbOf(color: PaintColor) {
  let c = rgbCache.get(color);
  if (!c) rgbCache.set(color, (c = srgb01(COLORS[color])));
  return c;
}
