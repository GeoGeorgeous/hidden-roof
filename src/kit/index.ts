import type { Category, PropDef } from './def';
import { fireescape, hatch, ladder, railing, stairs } from './access';
import { antenna, billboard, cable12, cable4, cable8, cctv, sign } from './details';
import { floodlight, lampPost, stringLights, wallLamp } from './lights';
import { neonCyan, neonPink } from './neon';
import { acLarge, acMedium, acSmall, acWall, duct, exhaust, utilitybox, ventshaft, watertower } from './equipment';
import { cableCorner, cableRun, cableUp, cableWall } from './cable-runs';
import { drainPipe, pipe, pipeCorner, pipeFloor, pipeUp, pipeWall } from './pipes';
import { building, door, doorOpen, halfBlock, parapet, slab, wall, wallLedge, windowWall } from './structure';
import { bladeSign, shopSign } from './signs';
import { signExit, signNoEntry, signPlate, signVoltage } from './small-signs';
import { debris, latticeMast, signTower, tankPair } from './steel';

/** The prop kit, in picker order. Pickups are added by the editor as their own category. */
export const KIT: PropDef[] = [
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
  lampPost,
  stringLights,
];

export const KIT_BY_TYPE = new Map(KIT.map((d) => [d.type, d]));

export function kitIn(c: Category) {
  return KIT.filter((d) => d.category === c);
}
