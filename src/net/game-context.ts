import type * as THREE from 'three';
import type { Inventory } from '../inventory/inventory';
import type { Level } from '../level/level';
import type { LevelData } from '../level/level-data';
import type { Pickups } from '../pickups/pickups';
import type { PaintDrips } from '../paint-drips';
import type { PaintOps } from '../paint-ops';
import type { PaintSystem } from '../painting';
import type { Player } from '../player';
import { surfaceTable } from '../save/shape';
import type { Tools } from '../tools/tools';
import type { ToClient } from './protocol';

// What multiplayer (multiplayer.ts) takes from the game, and the session's
// level a welcome puts the player in.

export interface MultiplayerContext {
  scene: THREE.Scene;
  camera: THREE.Camera;
  level: Level;
  paint: PaintSystem;
  paintOps: PaintOps;
  drips: PaintDrips;
  player: Player;
  inventory: Inventory;
  pickups: Pickups;
  tools: Tools;
  /** Paused behind the menu, and when the player last pressed or moved anything (s): what the others see them doing (own-status.ts). */
  paused(): boolean;
  lastActive(): number;
  /** The level as a file, and its name (what HOST starts the session on). */
  levelData(): { data: LevelData; name: string };
  /** The level's own paint file (save/level-paint.ts), if it has one: what FRESH LEVEL starts from. */
  levelPaint(): Uint8Array | null;
  /** Play this level (the session's), from its spawn, with the starting kit. */
  openLevel(data: LevelData, name: string): void;
  /** Play the level that's open from its spawn, with the starting kit, without building it again. */
  restartLevel(): void;
  /** Hold PAINT DETAIL at the session's (texels per meter), or give it back (null). */
  lockDetail(tpm: number | null): void;
  /** PAINT DETAIL back at the player's own at once, for the level opened next to be built with. */
  ownDetail(): void;
}

/**
 * Play this level from its spawn with the starting kit: the open one started
 * over when it's the same, built at `detail` (`built`: the detail it was built
 * at) and `also` holds, else built again, which takes seconds with its lights
 * and shaders.
 */
export function playLevel(g: MultiplayerContext, data: LevelData, name: string, built: number, detail: number, also = () => true) {
  const open = g.levelData();
  if (built === detail && open.name === name && also() && JSON.stringify(open.data) === JSON.stringify(data)) g.restartLevel();
  else g.openLevel(data, name);
}

/**
 * The welcome's level, at its PAINT DETAIL, from its spawn with the starting
 * kit (playLevel), without the tools the session turned off: none in the hands,
 * their pickups gone from the map (solo.ts puts them back).
 * False: this game builds it differently from the server (another version).
 */
export function playSessionLevel(g: MultiplayerContext, w: Extract<ToClient, { type: 'welcome' }>) {
  // Built at the session's detail too: the table doesn't say (its shapes are the same at every detail).
  const built = g.paint.texelsPerMeter;
  g.lockDetail(w.detail);
  g.inventory.allowOnly(w.session.tools);
  playLevel(g, w.level, w.levelName, built, w.detail, () => surfaceTable(g.paint.surfaces) === w.table);
  g.pickups.hideOff(g.inventory);
  return surfaceTable(g.paint.surfaces) === w.table;
}
