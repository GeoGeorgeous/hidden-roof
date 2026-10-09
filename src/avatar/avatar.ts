import * as THREE from 'three';
import { AVATAR, type CapId, type PaintColor } from '../config';
import { inkify } from '../render/ink/tone';
import { buildBody } from './body';
import { Held } from './held';
import type { Outfit } from './outfit';
import { Pose, type AvatarState } from './pose';
import { makeRig, sign, type Rig } from './rig';

// A humanoid figure: what other players see of you, and later NPCs. One
// skinned mesh (rig.ts, body.ts, outfit.ts) posed from a state each frame
// (pose.ts), holding a tool (held.ts). Not a collider, and nothing hits it.
// Place it with `group` (feet at its origin, facing -z when yaw is 0).

/** One ink material for every figure's body and tools: vertex colors in grays. */
let material: THREE.Material | null = null;
const ink = () => (material ??= inkify(new THREE.MeshLambertMaterial({ vertexColors: true })));
const noRaycast = () => {};

export class Avatar {
  readonly group = new THREE.Group();
  readonly rig: Rig = makeRig();
  private mesh: THREE.SkinnedMesh;
  private pose = new Pose(this.rig);
  private held = new Held(ink());
  private outfit: Outfit;

  constructor(outfit: Outfit = { hoodUp: AVATAR.hoodUp }) {
    this.outfit = { ...outfit };
    this.mesh = new THREE.SkinnedMesh(buildBody(this.rig, this.outfit), ink());
    this.mesh.add(this.rig.root);
    this.mesh.bind(this.rig.skeleton);
    // Poses reach past the rest pose's bounds; one figure is one draw call either way.
    this.mesh.frustumCulled = false;
    this.mesh.raycast = noRaycast;
    this.group.add(this.mesh);
    // The grip: in the palm of the right hand.
    const hand = this.rig.bone('handR');
    this.held.group.position.set(-sign('R') * 0.03, -AVATAR.palm * 0.62, 0);
    hand.add(this.held.group);
  }

  /** Change what it wears (or rebuild it in new AVATAR.colors); the body and its pose stay. */
  setOutfit(outfit: Outfit) {
    this.outfit = { ...outfit };
    this.mesh.geometry.dispose();
    this.mesh.geometry = buildBody(this.rig, this.outfit);
  }

  /** Pose it for this frame. `color`: the paint color, shown on the can's label; `cap`: the can's cap. */
  update(dt: number, state: AvatarState, color: PaintColor, cap: CapId = 'standard') {
    this.group.rotation.y = state.yaw;
    this.held.set(state.tool, color, cap);
    this.pose.update(dt, state);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.held.set(null, 'black', 'standard');
    this.group.removeFromParent();
  }
}
