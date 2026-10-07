import type { Category, PropDef } from './def';
import { fireescape, hatch, ladder, railing, stairs, stepladder } from './access';
import { antenna, billboard, cable, cctv, sign } from './details';
import { floodlight, lampPost, stringLights, wallLamp } from './lights';
import { neon } from './neon';
import { ac, duct, exhaust, utilitybox, ventshaft, watertower } from './equipment';
import { cableRun } from './cable-runs';
import { drainPipe, pipe } from './pipes';
import { building, parapet, plinth, slab, wall } from './structure';
import { bladeSign, shopSign } from './signs';
import { smallSign } from './small-signs';
import { debris, latticeMast, signTower, tankPair } from './steel';
import { ledgeOnBrackets, platformOnColumns, scaffolding } from './scaffold';

/** The prop kit, in picker order. Pickups are added by the editor as their own category. */
const KIT: PropDef[] = [
  building,
  slab,
  wall,
  parapet,
  plinth,
  scaffolding,
  platformOnColumns,
  ledgeOnBrackets,
  stairs,
  ladder,
  fireescape,
  hatch,
  railing,
  ac,
  ventshaft,
  duct,
  exhaust,
  pipe,
  drainPipe,
  cable,
  cableRun,
  watertower,
  tankPair,
  utilitybox,
  antenna,
  latticeMast,
  cctv,
  debris,
  sign,
  shopSign,
  bladeSign,
  smallSign,
  billboard,
  signTower,
  neon,
  wallLamp,
  floodlight,
  lampPost,
  stringLights,
];

/** Props that aren't in the build picker: the player's stepladder (a pickup, placed while playing). */
const ITEM_PROPS: PropDef[] = [stepladder];

const KIT_BY_TYPE = new Map([...KIT, ...ITEM_PROPS].map((d) => [d.type, d]));

/** Types of levels saved before variants that are now a variant of another type: old type -> [type, variant]. */
const RENAMED: Record<string, [string, string]> = {
  half_block: ['building', 'half'],
  wall_ledge: ['wall', 'ledge'],
  window: ['wall', 'window'],
  door: ['wall', 'door'],
  door_open: ['wall', 'open'],
  ac_small: ['ac', 'small'],
  ac_medium: ['ac', 'medium'],
  ac_large: ['ac', 'large'],
  ac_wall: ['ac', 'wall'],
  pipe_corner: ['pipe', 'corner'],
  pipe_floor: ['pipe', 'floor'],
  pipe_wall: ['pipe', 'wall'],
  pipe_up: ['pipe', 'up'],
  cable_4: ['cable', '4'],
  cable_8: ['cable', '8'],
  cable_12: ['cable', '12'],
  cable_corner: ['cable_run', 'corner'],
  cable_up: ['cable_run', 'up'],
  cable_wall: ['cable_run', 'wall'],
  sign_exit: ['small_sign', 'exit'],
  sign_voltage: ['small_sign', 'voltage'],
  sign_no_entry: ['small_sign', 'no_entry'],
  sign_plate: ['small_sign', 'plate'],
  neon_pink: ['neon', 'pink'],
  neon_cyan: ['neon', 'cyan'],
  neon_amber: ['neon', 'amber'],
};

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
