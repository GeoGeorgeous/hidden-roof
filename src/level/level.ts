import { MAX_TEXT } from '../render/ink/words';
import * as THREE from 'three';
import { defOf, upgraded } from '../kit';
import type { V3 } from '../kit/pieces';
import { V_MODULE, type PropDef } from '../kit/def';
import type { PaintSystem } from '../painting';
import { PAINT } from '../config';
import type { Ladder } from '../player';
import { DecorBatches } from './batches';
import { buildProp, disposeProp, solidBoxes, type BuiltProp, type Emitter, type LightAnchor, type PropInstance } from './build-prop';
import { CoverIndex } from './cover';
import type { Piece } from '../kit/pieces';
import { computeJoints, jointOwner, jointPieces, sameFinish, type Joint } from './joints';
import { instanceOf, propPieces } from './prop-pieces';
import { column, propAt, stackContext } from './stacks';
import type { Finish } from '../kit/finishes';

// The editable level: prop instances + everything built from them (meshes,
// colliders, ladders), auto joints between edge props, and decor batches.
// Faces pressed against another prop are decor (level/cover.ts): when a prop
// comes, goes or changes shape, the props and joints it touches are rebuilt.
// The collider/ladder/solid arrays are mutated in place so the player and the
// tools keep their references across edits.

export interface PropData {
  /**
   * Its id for good (level format 3): paint names surfaces by it (`p<id>#k`),
   * so a saved level keeps it through edits. Files without ids (format 2)
   * number props in file order.
   */
  id?: number;
  type: string;
  /** Its variant (PropDef.variants), for props that have them. */
  variant?: string;
  pos: V3;
  rot?: number;
  /** Per-instance setting (PropDef.adjust), e.g. floodlight tilt in degrees. */
  adjust?: number;
  /** Per-instance text (PropDef.text), e.g. a sign's words. */
  text?: string;
  /** Its wall finish (PropDef.finishes), when not its own look. */
  finish?: Finish;
  /** Mirrored left to right (a wall piece flipped with R in build mode). */
  mirror?: boolean;
}

export interface LevelData {
  /** 4: props keep their default variant even when it changes later (format 3 files: see kit/index.ts upgraded). */
  version: 2 | 3 | 4;
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
  /** Props whose pieces show lettering (Mat.letters): rebuilt when the text atlases change (rebuildLettered). */
  private lettered = new Set<number>();
  joints = new Map<string, { joint: Joint; b: BuiltProp }>();
  private batches = new DecorBatches();
  /** The level's solid boxes, by prop: what covers faces. */
  private cover = new CoverIndex();
  /** Solid boxes that came or went since the last refresh: the props and joints they touch are rebuilt then. */
  private touched: THREE.Box3[] = [];
  private nextId = 1;
  /** Props placed while playing, one per owner (a player's stepladder): owner -> prop id. */
  private runtime = new Map<string, number>();

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
    if (this.drop(id)) this.refresh();
  }

  /**
   * Put an owner's prop (a player's stepladder) here, or take it away (null).
   * Their previous one goes, and the level is refreshed once. Never saved; it
   * must not be paintable, since its id differs from client to client.
   */
  setRuntime(owner: string, data: PropData | null): PropInstance | null {
    const old = this.runtime.get(owner);
    if (old !== undefined) this.drop(old);
    const inst = data && this.create({ ...data, id: undefined }, false);
    if (inst) {
      inst.owner = owner;
      this.runtime.set(owner, inst.id);
      this.build(inst);
    }
    this.refresh();
    return inst;
  }

  /** The id of an owner's runtime prop, if one stands. */
  runtimeOf(owner: string) {
    return this.runtime.get(owner);
  }

  clear() {
    for (const b of this.built.values()) disposeProp(b, this.paint);
    for (const j of this.joints.values()) disposeProp(j.b, this.paint);
    this.paint.gpu.clear(); // every surface went: their pages go too
    this.built.clear();
    this.cover = new CoverIndex();
    this.touched = [];
    this.lettered.clear();
    this.joints.clear();
    this.props.clear();
    this.runtime.clear();
    this.nextId = 1;
    this.refresh();
  }

  load(data: LevelData) {
    this.clear();
    this.spawn = { pos: [...data.spawn.pos], yaw: data.spawn.yaw };
    // Create all instances first so stacking props see their neighbors when
    // built, and list every solid box first so each prop sees what covers it.
    for (const p of data.props) this.create(upgraded(p, data.version), false);
    const pieces = new Map([...this.props.values()].map((inst) => [inst.id, propPieces(inst, this.props.values())]));
    for (const inst of this.props.values()) this.cover.set(inst.id, solidBoxes(pieces.get(inst.id)!, inst.pos, inst.rot));
    for (const inst of this.props.values()) this.build(inst, pieces.get(inst.id));
    this.refresh();
  }

  toJSON(): LevelData {
    // Props the player placed while playing (the stepladder) aren't part of the level file. Default variants go unsaved.
    const props = [...this.props.values()].filter((p) => p.owner === undefined).map(({ id, type, variant, pos, rot, adjust, text, finish, mirror }) => ({ id, type, ...(variant === defOf(type)!.variant ? {} : { variant }), pos, rot, ...(mirror ? { mirror } : {}), ...(adjust === undefined ? {} : { adjust }), ...(text === undefined ? {} : { text }), ...(finish && Object.keys(finish).length ? { finish } : {}) }));
    return { version: 4, spawn: this.spawn, props };
  }

  /** Change a prop's per-instance setting (clamped to its range) and rebuild it. Returns the new value. */
  setAdjust(id: number, value: number) {
    const inst = this.props.get(id);
    const a = inst && defOf(inst.type, inst.variant)?.adjust;
    if (!inst || !a) return null;
    inst.adjust = Math.min(a.max, Math.max(a.min, +value.toFixed(3)));
    this.build(inst);
    this.refresh();
    return inst.adjust;
  }

  /** Change a sign's text (PropDef.text) and rebuild it; empty goes back to the default. */
  setText(id: number, text: string) {
    const inst = this.props.get(id);
    if (!inst || defOf(inst.type, inst.variant)?.text === undefined) return false;
    inst.text = text.trim().slice(0, MAX_TEXT) || undefined;
    this.build(inst);
    this.refresh();
    return true;
  }

  /** Change a prop's wall finish (PropDef.finishes; none: its own look) and rebuild it, keeping its paint. */
  setFinish(id: number, finish: Finish | undefined) {
    const inst = this.props.get(id);
    if (!inst) return false;
    inst.finish = finish;
    this.build(inst);
    this.refresh();
    return true;
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

  /** Rebuild every prop that shows lettering, keeping its paint: a text atlas grew or started over (render/ink/text-atlas.ts), so their rects moved. */
  rebuildLettered() {
    if (!this.lettered.size) return;
    for (const id of this.lettered) this.build(this.props.get(id)!);
    this.refresh();
  }

  /** Rebuild every prop and joint, keeping their paint (resampled into the new atlases after a paint detail change). */
  rebuildAll() {
    for (const inst of this.props.values()) this.build(inst);
    for (const [key, { joint, b: old }] of this.joints) {
      disposeProp(old, this.paint);
      const b = this.buildJoint(key, joint);
      this.paint.carry(old.paint, b.paint);
      this.joints.set(key, { joint, b });
    }
    this.refresh();
  }

  /** Draw-ready: merge decor if anything changed. Call once per frame. */
  flush() {
    this.batches.flush(this.allBuilt);
  }

  /** Every built prop and joint, as of the last change. */
  get builtProps(): readonly BuiltProp[] {
    return this.allBuilt;
  }

  /** Merge every tile again (the surfaces' light blocks moved). */
  remerge() {
    this.batches.remergeAll();
  }

  /** The merged level: paintable surfaces and decor (the profiler's probe hides each). */
  get merged() {
    return { surfaces: this.batches.surfaces, decor: this.batches.decor };
  }

  /** A decor proxy got new baked light: copy it into its batch. */
  pushBaked(geo: THREE.BufferGeometry) {
    this.batches.pushBaked(geo);
  }

  /** Bounding box of everything except cables (which can span far). */
  /** The level's extent, without cables and without what players placed (their stepladders): the city is laid out around it. */
  totalBounds() {
    const box = new THREE.Box3();
    for (const [id, b] of this.built) {
      const p = this.props.get(id);
      if (p && !p.type.startsWith('cable') && p.owner === undefined) box.union(b.bounds);
    }
    return box;
  }

  idOf(o: THREE.Object3D): number | undefined {
    return o.userData.propId;
  }

  /**
   * The prop build mode works on when a ray hits `o` at `point` (RMB deletes it,
   * MMB picks it, it's outlined): the prop itself, or for a joint post the edge
   * prop ending there that is nearest the point. Never a player's stepladder.
   */
  targetOf(o: THREE.Object3D, point: THREE.Vector3): number | undefined {
    const key: string | undefined = o.userData.joint;
    const joint = key === undefined ? undefined : this.joints.get(key)?.joint;
    const id = key === undefined ? this.idOf(o) : joint && jointOwner(joint, this.props.values(), point);
    const inst = id === undefined ? undefined : this.props.get(id);
    return inst && inst.owner === undefined ? inst.id : undefined;
  }

  /** Does any box penetrate a placed prop's colliders (joints excluded)? `ignore`: a prop id to leave out. */
  overlaps(boxes: THREE.Box3[], margin = 0.02, ignore?: number) {
    const shrunk = boxes.map((b) => b.clone().expandByScalar(-margin));
    const all = shrunk.reduce((u, s) => u.union(s), new THREE.Box3());
    for (const [id, b] of this.built) {
      if (id === ignore || !b.bounds.intersectsBox(all)) continue;
      for (const c of b.colliders) for (const s of shrunk) if (s.intersectsBox(c)) return true;
    }
    return false;
  }

  /** Stacking neighbors (PropContext.above / below) of a prop (a def resolved by defOf) at `pos`. */
  stackContext(def: PropDef, pos: V3, rot: number) {
    return stackContext(this.props.values(), def, pos, rot);
  }

  private create(data: PropData, build = true): PropInstance | null {
    const inst = instanceOf(data, this.nextId, (id) => this.props.has(id));
    if (!inst) return null;
    this.nextId = Math.max(this.nextId, inst.id + 1);
    this.props.set(inst.id, inst);
    if (build) this.build(inst);
    return inst;
  }

  /**
   * (Re)build a prop, its paint carried over face by face. Its solid boxes go
   * into the cover index (not for a player's stepladder: it differs from client
   * to client); when they changed, what they touch is rebuilt on refresh.
   */
  private build(inst: PropInstance, pieces: Piece[] = propPieces(inst, this.props.values())) {
    const old = this.built.get(inst.id);
    if (old) disposeProp(old, this.paint);
    if (pieces.some((p) => 'mat' in p && p.mat.letters)) this.lettered.add(inst.id);
    else this.lettered.delete(inst.id);
    if (inst.owner === undefined) {
      const was = [...this.cover.boxesOf(inst.id)];
      const boxes = solidBoxes(pieces, inst.pos, inst.rot);
      if (this.cover.set(inst.id, boxes)) this.touched.push(...was, ...boxes);
    }
    const b = buildProp(inst.id, `p${inst.id}`, pieces, inst.pos, inst.rot, this.paint, this.cover);
    this.root.add(b.group);
    this.built.set(inst.id, b);
    if (old) this.paint.carry(old.paint, b.paint);
  }

  /**
   * Stacking props depend on their neighbor one level up (fire escape) or down
   * (building block): rebuild the neighbors whose shape changes.
   */
  private rebuildStack(inst: PropInstance) {
    const def = defOf(inst.type, inst.variant)!;
    const s = def.stacks;
    if (!s) return;
    const below = s.above ? propAt(this.props.values(), def, [inst.pos[0], inst.pos[1] - (def.vSnap ?? V_MODULE), inst.pos[2]], inst.rot) : undefined;
    if (below) this.build(below);
    // Only the lowest prop above can change (it may become the bottom of the column).
    if (s.below) {
      const above = column(this.props.values(), def, inst.pos, inst.rot).filter((p) => p.pos[1] > inst.pos[1] + 0.01);
      const lowest = above.sort((a, b) => a.pos[1] - b.pos[1])[0];
      if (lowest) this.build(lowest);
    }
  }

  /** Take a prop out without refreshing; false if there's none with this id. */
  private drop(id: number) {
    const inst = this.props.get(id);
    if (!inst) return false;
    const b = this.built.get(id);
    if (b) disposeProp(b, this.paint);
    this.touched.push(...this.cover.boxesOf(id));
    this.cover.delete(id);
    this.built.delete(id);
    this.lettered.delete(id);
    this.props.delete(id);
    if (inst.owner !== undefined) this.runtime.delete(inst.owner);
    this.rebuildStack(inst);
    return true;
  }

  /** Update joints, flat arrays and batches after a change. */
  private refresh() {
    // What touches a box that came or went is rebuilt: its covered faces may have changed.
    const near = this.touched.map((b) => b.clone().expandByScalar(PAINT.coverGap * 2));
    this.touched = [];
    const touches = (b: BuiltProp) => near.some((n) => n.intersectsBox(b.bounds));
    if (near.length) for (const [id, b] of this.built) if (touches(b)) this.build(this.props.get(id)!);
    const want = computeJoints(this.props.values());
    for (const [key, j] of this.joints) {
      if (want.has(key)) continue;
      disposeProp(j.b, this.paint);
      this.joints.delete(key);
    }
    for (const [key, joint] of want) {
      const old = this.joints.get(key);
      if (old && sameFinish(old.joint, joint) && !touches(old.b)) continue;
      // New, its finish changed, or what covers it: (re)built, its paint carried over.
      const b = this.buildJoint(key, joint);
      if (old) {
        this.paint.carry(old.b.paint, b.paint);
        disposeProp(old.b, this.paint);
      }
      this.joints.set(key, { joint, b });
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

  private buildJoint(key: string, joint: Joint) {
    const b = buildProp(-1, `j${key}`, jointPieces(joint), joint.pos, 0, this.paint, this.cover);
    for (const o of b.group.children) o.userData.joint = key;
    this.root.add(b.group);
    return b;
  }

  private allBuilt: BuiltProp[] = [];
}
