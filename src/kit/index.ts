import type { Category, PropDef } from './def';
import { fireescape, hatch, ladder, railing, stairs, stepladder } from './access';
import { antenna, billboard, cable12, cable4, cable8, cctv, sign } from './details';
import { floodlight, lampPost, stringLights, wallLamp } from './lights';
import { neonAmber, neonCyan, neonPink } from './neon';
import { acLarge, acMedium, acSmall, acWall, duct, exhaust, utilitybox, ventshaft, watertower } from './equipment';
import { cableCorner, cableRun, cableUp, cableWall } from './cable-runs';
import { drainPipe, pipe, pipeCorner, pipeFloor, pipeUp, pipeWall } from './pipes';
import { building, door, doorOpen, halfBlock, parapet, slab, wall, wallLedge, windowWall } from './structure';
import { bladeSign, shopSign } from './signs';
import { signExit, signNoEntry, signPlate, signVoltage } from './small-signs';
import { debris, latticeMast, signTower, tankPair } from './steel';

/** The prop kit, in picker order. Pickups are added by the editor as their own category. */
const KIT: PropDef[] = [
  building,
  halfBlock,
  slab,
  wall,
  wallLedge,
  parapet,
  door,
  doorOpen,
  windowWall,
  stairs,
  ladder,
  fireescape,
  railing,
  hatch,
  acSmall,
  acMedium,
  acLarge,
  acWall,
  ventshaft,
  duct,
  pipe,
  pipeCorner,
  pipeFloor,
  pipeWall,
  pipeUp,
  drainPipe,
  exhaust,
  utilitybox,
  watertower,
  tankPair,
  debris,
  cable4,
  cable8,
  cable12,
  cableRun,
  cableCorner,
  cableUp,
  cableWall,
  antenna,
  latticeMast,
  cctv,
  sign,
  shopSign,
  bladeSign,
  signExit,
  signVoltage,
  signNoEntry,
  signPlate,
  signTower,
  billboard,
  wallLamp,
  floodlight,
  neonPink,
  neonCyan,
  neonAmber,
  lampPost,
  stringLights,
];

/** Props that aren't in the build picker: the player's stepladder (a pickup, placed while playing). */
const ITEM_PROPS: PropDef[] = [stepladder];

const KIT_BY_TYPE = new Map([...KIT, ...ITEM_PROPS].map((d) => [d.type, d]));

/** Types of levels saved before variants that are now a variant of another type: old type -> [type, variant]. */
const RENAMED: Record<string, [string, string]> = {};

/** A saved prop's type and variant as they are named now. */
export function renamed(type: string, variant?: string): [string, string | undefined] {
  return RENAMED[type] ?? [type, variant];
}

const resolved = new Map<string, PropDef>();

/**
 * The def a prop builds and places with: its type's def with its variant
 * merged in (the first variant when it has none, or an unknown one).
 * Undefined for an unknown type.
 */
export function defOf(type: string, variant?: string): PropDef | undefined {
  const key = `${type}|${variant ?? ''}`;
  let def = resolved.get(key);
  if (def) return def;
  const base = KIT_BY_TYPE.get(type);
  if (!base?.variants) return base;
  const v = base.variants.find((x) => x.id === variant) ?? base.variants[0];
  if (variant !== undefined && v.id !== variant) console.warn(`unknown variant "${variant}" of "${type}"`);
  const { id, label, ...over } = v;
  def = { ...base, ...over, label: `${base.label} (${label})`, variant: id };
  resolved.set(key, def);
  return def;
}

export function kitIn(c: Category) {
  return KIT.filter((d) => d.category === c);
}
