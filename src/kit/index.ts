import type { Category, PropDef } from './def';
import { fireescape, ladder, railing, stairs } from './access';
import { antenna, billboard, cable12, cable4, cable8, cctv, sign } from './details';
import { floodlight, lampPost, stringLights, wallLamp } from './lights';
import { neonCyan, neonPink } from './neon';
import { acLarge, acMedium, acSmall, acWall, duct, exhaust, pipe, utilitybox, ventshaft, watertower } from './equipment';
import { building, corner, door, parapet, slab, wall, wallLedge, windowWall } from './structure';

/** The prop kit, in picker order. Pickups are added by the editor as their own category. */
export const KIT: PropDef[] = [
  building,
  slab,
  wall,
  wallLedge,
  corner,
  parapet,
  door,
  windowWall,
  stairs,
  ladder,
  fireescape,
  railing,
  acSmall,
  acMedium,
  acLarge,
  acWall,
  ventshaft,
  duct,
  pipe,
  exhaust,
  utilitybox,
  watertower,
  cable4,
  cable8,
  cable12,
  antenna,
  sign,
  cctv,
  billboard,
  wallLamp,
  floodlight,
  neonPink,
  neonCyan,
  lampPost,
  stringLights,
];

export const KIT_BY_TYPE = new Map(KIT.map((d) => [d.type, d]));

export function kitIn(c: Category) {
  return KIT.filter((d) => d.category === c);
}
