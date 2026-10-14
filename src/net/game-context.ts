import type * as THREE from 'three';
import { PAINT } from '../config';
import type { Inventory } from '../inventory/inventory';
import type { Level, LevelData } from '../level/level';
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
}

/**
 * The welcome's level, at its PAINT DETAIL, from its spawn with the starting
 * kit: the open one started over when it's the same, built at its detail,
 * since building it again takes seconds with its lights and shaders (BL-085).
 * False: this game builds it differently from the server (another version).
 */
export function playSessionLevel(g: MultiplayerContext, w: Extract<ToClient, { type: 'welcome' }>) {
  // Built at the session's detail too: the table doesn't say (its shapes are the same at every detail).
  const built = PAINT.texelsPerMeter;
  g.lockDetail(w.detail);
  const open = g.levelData();
  if (built === w.detail && open.name === w.levelName && surfaceTable(g.paint.surfaces) === w.table && JSON.stringify(open.data) === JSON.stringify(w.level)) g.restartLevel();
  else g.openLevel(w.level, w.levelName);
  return surfaceTable(g.paint.surfaces) === w.table;
}
