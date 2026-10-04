import * as THREE from 'three';
import { PLAYER, STEPLADDER_PLACE } from '../config';
import { extentOf } from '../build/extent';
import { floorBelow } from '../build/floor';
import { Ghost } from '../build/ghost';
import { axisNormal, place } from '../build/placement';
import type { Input } from '../input';
import { KIT_BY_TYPE } from '../kit';
import { STEPLADDER } from '../kit/access';
import { LadderModel } from './ladder-model';
import type { V3 } from '../kit/pieces';
import { rotate } from '../level/build-prop';
import type { Level } from '../level/level';

// Slot 3: the stepladder. Like build mode (same placement, preview and overlap
// test) but free of the grid: it stands where the crosshair points, on the
// floor (aiming at a wall puts it on the floor in front of the wall), turned
// to face you; the mouse wheel turns it a quarter turn from there (quarter
// turns: prop colliders stay axis-aligned). Green when it
// can stand there: all four feet on one flat floor, nothing in its way or in
// you, and room in front to walk up and climb it. LMB places it; there is only
// one, so placing it again moves it. It's a level prop while it stands
// (colliders, climbing), but never saved with the level. In hand, the view
// model shows the folded ladder (ladder-model.ts).

const NO_STACK = { above: false, below: false };

export class LadderTool {
  /** Called when LMB can't place it (shown as a toast). */
  onBlocked: () => void = () => {};
  readonly model = new LadderModel();
  private ghost: Ghost;
  private ray = new THREE.Raycaster();
  private def = KIT_BY_TYPE.get('stepladder')!;
  /** The ladder standing in the level now, if any. */
  private placedId: number | null = null;
  private target: { pos: V3; rot: number } | null = null;
  private valid = false;
  /** Quarter turns added with the mouse wheel to "facing you". */
  private turn = 0;

  constructor(
    scene: THREE.Scene,
    private level: Level,
  ) {
    this.ghost = new Ghost(scene);
    this.ghost.visible = false;
  }

  /** `player`: feet position; `active`: the ladder is in hand. */
  update(input: Input, camera: THREE.Camera, player: THREE.Vector3, active: boolean) {
    this.model.update(camera, active);
    if (!active) {
      this.ghost.visible = false;
      this.target = null;
      return;
    }
    if (input.wheelSteps) this.turn = (this.turn + Math.sign(input.wheelSteps) + 4) % 4;
    this.aim(camera, player);
    if (!input.clicked(0) || !this.target) return;
    if (this.valid) this.put(this.target);
    else this.onBlocked();
  }

  /** Is this mesh part of the ladder standing now? (Aiming and support look through it: it's about to move.) */
  private isPlaced = (o: THREE.Object3D) => this.placedId !== null && this.level.idOf(o) === this.placedId;

  private aim(camera: THREE.Camera, player: THREE.Vector3) {
    camera.getWorldDirection(this.ray.ray.direction);
    this.ray.ray.origin.copy(camera.position);
    this.ray.far = STEPLADDER_PLACE.reach;
    const hit = this.ray.intersectObject(this.level.root, true).find((h) => !this.isPlaced(h.object) && h.face);
    if (!hit) {
      this.ghost.visible = false;
      this.target = null;
      return;
    }
    const rot = (facing(hit.point, camera.position) + this.turn) % 4;
    const floorAt = (x: number, y: number, z: number) => floorBelow(this.level.root, x, y, z, 6, this.isPlaced);
    const pl = place(this.def, { point: hit.point, normal: axisNormal(hit.face!.normal) }, rot, floorAt, extentOf(this.def, rot));
    this.ghost.showProp(this.def, pl.pos, pl.rot, NO_STACK);
    this.valid = pl.ok && this.canStand(pl.pos, pl.rot, player);
    this.ghost.setValid(this.valid);
    this.ghost.visible = true;
    this.target = { pos: pl.pos, rot: pl.rot };
  }

  /** Can the ladder physically stand at `pos` turned `rot`, and can the player use it there? */
  private canStand(pos: V3, rot: number, player: THREE.Vector3) {
    const { foot: f, halfWidth: w } = STEPLADDER;
    const base = pos[1];
    const at = (x: number, y: number, z: number) => rotate([x, y, z], rot).add(new THREE.Vector3(...pos));
    const ground = (p: THREE.Vector3, rise: number) => floorBelow(this.level.root, p.x, base + rise, p.z, rise + 1, this.isPlaced);
    // All four feet on the same flat floor: not over an edge, a gap or a step.
    for (const [x, z] of [[-w, -f], [w, -f], [-w, f], [w, f]]) {
      const y = ground(at(x, 0, z), 0.05);
      if (y === null || Math.abs(y - base) > STEPLADDER_PLACE.footTolerance) return false;
    }
    // Nothing in its way (the ladder standing now is about to move, so it doesn't count).
    if (this.level.overlaps(this.ghost.colliders, 0.02, this.placedId ?? undefined)) return false;
    // Not inside the player.
    const r = PLAYER.radius - 0.02;
    const you = new THREE.Box3(new THREE.Vector3(player.x - r, player.y + 0.02, player.z - r), new THREE.Vector3(player.x + r, player.y + PLAYER.height, player.z + r));
    if (this.ghost.colliders.some((c) => c.intersectsBox(you))) return false;
    // Room to stand in front of it and climb: free space the player's size, on a floor you can step to.
    const space = new THREE.Box3().setFromPoints([at(-w, PLAYER.stepHeight, -f - 0.05), at(w, PLAYER.height, -f - 0.65)]);
    if (this.level.overlaps([space], 0.02, this.placedId ?? undefined)) return false;
    const step = STEPLADDER_PLACE.standStep;
    const front = ground(at(0, 0, -f - 0.35), step);
    return front !== null && Math.abs(front - base) <= step;
  }

  private put(t: { pos: V3; rot: number }) {
    const old = this.placedId === null ? undefined : this.level.props.get(this.placedId);
    if (old?.runtime) this.level.remove(old.id);
    const inst = this.level.add({ type: this.def.type, pos: t.pos, rot: t.rot });
    if (!inst) return;
    inst.runtime = true;
    this.placedId = inst.id;
    this.valid = false; // re-checked next frame against the new ladder
  }
}

/** The quarter turn whose front (-z) faces back toward the eye. */
function facing(at: THREE.Vector3, eye: THREE.Vector3) {
  let best = 0;
  let bestDot = -Infinity;
  for (let r = 0; r < 4; r++) {
    const front = rotate([0, 0, -1], r);
    const d = front.x * (eye.x - at.x) + front.z * (eye.z - at.z);
    if (d > bestDot) {
      bestDot = d;
      best = r;
    }
  }
  return best;
}
