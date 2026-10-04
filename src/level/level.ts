import * as THREE from 'three';
import { KIT_BY_TYPE } from '../kit';
import type { V3 } from '../kit/pieces';
import { V_MODULE } from '../kit/def';
import type { PaintSystem } from '../painting';
import type { Ladder } from '../player';
import { DecorBatches } from './batches';
import { buildProp, disposeProp, type BuiltProp, type Emitter, type LightAnchor, type PropInstance } from './build-prop';
import { computeJoints, jointPieces, type Joint } from './joints';

// The editable level: prop instances + everything built from them (meshes,
// colliders, ladders), auto joints between edge props, and decor batches.
// The collider/ladder/solid arrays are mutated in place so the player and the
// tools keep their references across edits.

export interface PropData {
  type: string;
  pos: V3;
  rot?: number;
  /** Per-instance setting (PropDef.adjust), e.g. floodlight tilt in degrees. */
  adjust?: number;
}

export interface LevelData {
  version: 2;
  spawn: { pos: V3; yaw: number };
  props: PropData[];
  /** Owned by other systems (pickups). */
  [extra: string]: unknown;
}

export class Level {
  readonly root = new THREE.Group();
  readonly colliders: THREE.Box3[] = [];
  readonly ladders: Ladder[] = [];
  readonly solids: THREE.Mesh[] = [];
  readonly lights: LightAnchor[] = [];
  readonly emitters: Emitter[] = [];
  readonly props = new Map<number, PropInstance>();
  spawn = { pos: [0, 0, 0] as V3, yaw: 0 };
  /** Called after every structural change. */
  onChange: () => void = () => {};

  private built = new Map<number, BuiltProp>();
  joints = new Map<string, { joint: Joint; b: BuiltProp }>();
  private batches = new DecorBatches();
  private nextId = 1;

  constructor(
    scene: THREE.Scene,
    private paint: PaintSystem,
  ) {
    scene.add(this.root, this.batches.root);
  }

  add(data: PropData): PropInstance | null {
    const inst = this.create(data);
    if (inst) {
      this.rebuildStack(inst);
      this.refresh();
    }
    return inst;
  }

  remove(id: number) {
    const inst = this.props.get(id);
    if (!inst) return;
    const b = this.built.get(id);
    if (b) disposeProp(b, this.paint);
    this.built.delete(id);
    this.props.delete(id);
    this.rebuildStack(inst);
    this.refresh();
  }

  clear() {
    for (const b of this.built.values()) disposeProp(b, this.paint);
    for (const j of this.joints.values()) disposeProp(j.b, this.paint);
    this.built.clear();
    this.joints.clear();
    this.props.clear();
    this.refresh();
  }

  load(data: LevelData) {
    this.clear();
    this.spawn = { pos: [...data.spawn.pos], yaw: data.spawn.yaw };
    // Create all instances first so stacking props see their neighbors when built.
    for (const p of data.props) this.create(p, false);
    for (const inst of this.props.values()) this.build(inst);
    this.refresh();
  }

  toJSON(): LevelData {
    const props = [...this.props.values()].map(({ type, pos, rot, adjust }) => (adjust === undefined ? { type, pos, rot } : { type, pos, rot, adjust }));
    return { version: 2, spawn: this.spawn, props };
  }

  /** Change a prop's per-instance setting (clamped to its range) and rebuild it. Returns the new value. */
  setAdjust(id: number, value: number) {
    const inst = this.props.get(id);
    const a = inst && KIT_BY_TYPE.get(inst.type)?.adjust;
    if (!inst || !a) return null;
    inst.adjust = Math.min(a.max, Math.max(a.min, +value.toFixed(3)));
    this.build(inst);
    this.refresh();
    return inst.adjust;
  }

  /** Rebuild every prop that carries lights (lens colors and floodlight heads follow LIGHTS); their paint carries over. */
  rebuildLit() {
    let any = false;
    for (const [id, b] of this.built) {
      if (!b.lights.length) continue;
      this.build(this.props.get(id)!);
      any = true;
    }
    if (any) this.refresh();
  }

  /** Rebuild every prop and joint, keeping their paint (resampled into the new atlases after a paint detail change). */
  rebuildAll() {
    for (const inst of this.props.values()) this.build(inst, true);
    for (const [key, { joint, b: old }] of this.joints) {
      disposeProp(old, this.paint);
      const b = this.buildJoint(joint);
      this.carryPaint(old, b);
      this.joints.set(key, { joint, b });
    }
    this.refresh();
  }

  /** A rebuild of the same pieces yields the same paint surfaces, in the same order. */
  private carryPaint(old: BuiltProp, fresh: BuiltProp) {
    fresh.paint.forEach((s, i) => old.paint[i] && this.paint.adopt(s, old.paint[i]));
  }

  /** Draw-ready: merge decor if anything changed. Call once per frame. */
  flush() {
    this.batches.flush(this.allBuilt);
  }

  /** Every built prop and joint, as of the last change. */
  get builtProps(): readonly BuiltProp[] {
    return this.allBuilt;
  }

  /** A decor proxy got new baked light: copy it into its batch. */
  pushBaked(geo: THREE.BufferGeometry) {
    this.batches.pushBaked(geo);
  }

  /** Bounding box of everything except cables (which can span far). */
  totalBounds() {
    const box = new THREE.Box3();
    for (const [id, b] of this.built) if (!this.props.get(id)?.type.startsWith('cable')) box.union(b.bounds);
    return box;
  }

  idOf(o: THREE.Object3D): number | undefined {
    return o.userData.propId;
  }

  /** Does any box penetrate a placed prop's colliders (joints excluded)? */
  overlaps(boxes: THREE.Box3[], margin = 0.02) {
    const shrunk = boxes.map((b) => b.clone().expandByScalar(-margin));
    const all = shrunk.reduce((u, s) => u.union(s), new THREE.Box3());
    for (const b of this.built.values()) {
      if (!b.bounds.intersectsBox(all)) continue;
      for (const c of b.colliders) for (const s of shrunk) if (s.intersectsBox(c)) return true;
    }
    return false;
  }

  /** Stacking neighbors (PropContext.above / below) of a prop at `pos`. */
  stackContext(type: string, pos: V3, rot: number) {
    const def = KIT_BY_TYPE.get(type);
    const above = !!def?.stacks?.above && this.findAt(type, [pos[0], pos[1] + V_MODULE, pos[2]], rot) !== undefined;
    const below = !!def?.stacks?.below && this.column(type, pos, rot).some((p) => p.pos[1] < pos[1] - 0.01);
    return { above, below };
  }

  private create(data: PropData, build = true): PropInstance | null {
    if (!KIT_BY_TYPE.has(data.type)) {
      console.warn(`unknown prop type "${data.type}"`);
      return null;
    }
    const inst: PropInstance = { id: this.nextId++, type: data.type, pos: [...data.pos], rot: (((data.rot ?? 0) % 4) + 4) % 4, adjust: data.adjust };
    this.props.set(inst.id, inst);
    if (build) this.build(inst);
    return inst;
  }

  /**
   * (Re)build a prop. Its paint carries over to the new build: always with
   * `resample` (paint detail changed: same faces, new atlas), otherwise when
   * its paint faces are unchanged, e.g. a building block that gained or lost
   * its facade because a block was placed or removed under it.
   */
  private build(inst: PropInstance, resample = false) {
    const old = this.built.get(inst.id);
    if (old) disposeProp(old, this.paint);
    const def = KIT_BY_TYPE.get(inst.type)!;
    const seed = Math.abs(Math.round(inst.pos[0] * 7 + inst.pos[2] * 13));
    const adjust = inst.adjust ?? def.adjust?.initial() ?? 0;
    const ctx = { seed, pos: inst.pos, adjust, ...this.stackContext(inst.type, inst.pos, inst.rot) };
    const b = buildProp(inst.id, def.build(ctx), inst.pos, inst.rot, this.paint);
    this.root.add(b.group);
    this.built.set(inst.id, b);
    if (old && (resample || samePaintFaces(old, b))) this.carryPaint(old, b);
  }

  /**
   * Stacking props depend on their neighbor one level up (fire escape) or down
   * (building block): rebuild the neighbors whose shape changes.
   */
  private rebuildStack(inst: PropInstance) {
    const s = KIT_BY_TYPE.get(inst.type)?.stacks;
    if (!s) return;
    const below = s.above ? this.findAt(inst.type, [inst.pos[0], inst.pos[1] - V_MODULE, inst.pos[2]], inst.rot) : undefined;
    if (below) this.build(below);
    // Only the lowest prop above can change (it may become the bottom of the column).
    if (s.below) {
      const above = this.column(inst.type, inst.pos, inst.rot).filter((p) => p.pos[1] > inst.pos[1] + 0.01);
      const lowest = above.sort((a, b) => a.pos[1] - b.pos[1])[0];
      if (lowest) this.build(lowest);
    }
  }

  /** Props of this type in the same vertical column (same x, z). */
  private column(type: string, pos: V3, rot: number) {
    const anyRot = KIT_BY_TYPE.get(type)?.place === 'cell';
    return [...this.props.values()].filter((p) => p.type === type && (anyRot || p.rot === rot) && Math.abs(p.pos[0] - pos[0]) < 0.01 && Math.abs(p.pos[2] - pos[2]) < 0.01);
  }

  /** Cell props fill the same space whatever their facing, so their rotation doesn't matter. */
  private findAt(type: string, pos: V3, rot: number) {
    const anyRot = KIT_BY_TYPE.get(type)?.place === 'cell';
    for (const p of this.props.values()) {
      if (p.type === type && (anyRot || p.rot === rot) && pos.every((v, i) => Math.abs(v - p.pos[i]) < 0.01)) return p;
    }
    return undefined;
  }

  /** Update joints, flat arrays and batches after a change. */
  private refresh() {
    const want = computeJoints(this.props.values(), KIT_BY_TYPE);
    for (const [key, j] of this.joints) {
      if (want.has(key)) continue;
      disposeProp(j.b, this.paint);
      this.joints.delete(key);
    }
    for (const [key, joint] of want) {
      if (!this.joints.has(key)) this.joints.set(key, { joint, b: this.buildJoint(joint) });
    }
    this.colliders.length = 0;
    this.ladders.length = 0;
    this.solids.length = 0;
    this.lights.length = 0;
    this.emitters.length = 0;
    const all = [...this.built.values(), ...[...this.joints.values()].map((j) => j.b)];
    for (const b of all) {
      this.colliders.push(...b.colliders);
      this.ladders.push(...b.ladders);
      this.solids.push(...b.solids);
      this.lights.push(...b.lights);
      this.emitters.push(...b.emitters);
    }
    this.batches.markDirty();
    this.allBuilt = all;
    this.onChange();
  }

  private buildJoint(joint: Joint) {
    const b = buildProp(-1, jointPieces(joint.kind), joint.pos, 0, this.paint);
    this.root.add(b.group);
    return b;
  }

  private allBuilt: BuiltProp[] = [];
}

/** The same paint surfaces with the same face sizes, so paint carries over texel for texel. */
function samePaintFaces(a: BuiltProp, b: BuiltProp) {
  return (
    a.paint.length === b.paint.length &&
    a.paint.every((s, i) => {
      const ra = s.geo.rects;
      const rb = b.paint[i].geo.rects;
      return ra.length === rb.length && ra.every((r, k) => r.w === rb[k].w && r.h === rb[k].h);
    })
  );
}
