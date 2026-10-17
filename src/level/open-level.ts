import * as THREE from 'three';
import type { Inventory } from '../inventory/inventory';
import type { PaintDrips } from '../paint-drips';
import type { PaintSystem } from '../painting';
import type { PickupData, Pickups } from '../pickups/pickups';
import type { Player } from '../player';
import { buildSkyline, disposeSkyline, type SkylineSettings } from '../skyline';
import type { Level } from './level';
import type { LevelData } from './level-data';

// The level that's open: its name (paint saves and sessions name it), the
// level as a file (props, pickups, the city's overrides of SKYLINE), and what
// opening it does: the level built, the city around it, its pickups, the
// starting kit, the player at its spawn.

export class OpenLevel {
  /** The city around it (skyline.ts), built with it. */
  city = new THREE.Group();
  /** The level's own overrides of SKYLINE. */
  private skyline: SkylineSettings = {};

  constructor(
    private w: { scene: THREE.Scene; level: Level; pickups: Pickups; inventory: Inventory; drips: PaintDrips; paint: PaintSystem; player: Player },
    /** From ?level=, or the file opened in build mode, or a session's. */
    public name: string,
  ) {}

  /**
   * Play `data` from its spawn with the starting kit. `build` false: it's the
   * open level, started over without building it again (that, its lights and
   * shaders take seconds): no paint, no one's stepladder.
   */
  load(data: LevelData, build = true) {
    const { level, paint, drips, pickups, inventory, player } = this.w;
    drips.clear();
    if (build) level.load(data);
    else (paint.clear(), level.clearRuntime());
    pickups.load(data.pickups as PickupData[] | undefined);
    inventory.reset();
    this.skyline = (data.skyline as SkylineSettings | undefined) ?? {};
    if (build) this.rebuildCity();
    player.setSpawn(new THREE.Vector3(...data.spawn.pos), data.spawn.yaw);
  }

  /** A level file opened (build mode's LOAD, a session's level). */
  open(data: LevelData, name: string) {
    this.name = name;
    this.load(data);
  }

  /** The open level from its spawn, as it's built (a session's welcome to it). */
  restart() {
    this.load(this.toJSON(), false);
  }

  /** The city around the level, from SKYLINE and the level's overrides (settings rebuild it too). */
  rebuildCity() {
    const { scene, level } = this.w;
    scene.remove(this.city);
    disposeSkyline(this.city);
    this.city = buildSkyline(level.totalBounds(), this.skyline);
    scene.add(this.city);
  }

  /** The level as a file. */
  toJSON(): LevelData {
    return { ...this.w.level.toJSON(), pickups: this.w.pickups.toJSON(), ...(Object.keys(this.skyline).length ? { skyline: this.skyline } : {}) };
  }
}
