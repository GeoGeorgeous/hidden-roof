import { MAX_TEXT } from '../render/ink/words';
import * as THREE from 'three';
import { defOf, renamed, upgraded } from '../kit';
import type { V3 } from '../kit/pieces';
import { V_MODULE, type PropDef } from '../kit/def';
import type { PaintSystem } from '../painting';
import type { Ladder } from '../player';
import { DecorBatches } from './batches';
import { buildProp, disposeProp, type BuiltProp, type Emitter, type LightAnchor, type PropInstance } from './build-prop';
import { computeJoints, jointPieces, sameFinish, type Joint } from './joints';
import type { Finish } from '../kit/finishes';

// The editable level: prop instances + everything built from them (meshes,
// colliders, ladders), auto joints between edge props, and decor batches.
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
  /** Wall and floor finishes (PropDef.finishes), when not its own look. */
  finish?: Finish;
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
    const inst = data && this.create({ ...data, id: undefined });
    if (inst) {
      inst.owner = owner;
      this.runtime.set(owner, inst.id);
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
    this.built.clear();
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
    // Create all instances first so stacking props see their neighbors when built.
    for (const p of data.props) this.create(upgraded(p, data.version), false);
    for (const inst of this.props.values()) this.build(inst);
    this.refresh();
  }

  toJSON(): LevelData {
    // Props the player placed while playing (the stepladder) aren't part of the level file. Default variants go unsaved.
    const props = [...this.props.values()].filter((p) => p.owner === undefined).map(({ id, type, variant, pos, rot, adjust, text, finish }) => ({ id, type, ...(variant === defOf(type)!.variant ? {} : { variant }), pos, rot, ...(adjust === undefined ? {} : { adjust }), ...(text === undefined ? {} : { text }), ...(finish && Object.keys(finish).length ? { finish } : {}) }));
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

  /** Change a prop's wall and floor finishes (PropDef.finishes; none: its own look) and rebuild it, keeping its paint. */
  setFinish(id: number, finish: Finish | undefined) {
    const inst = this.props.get(id);
    if (!inst) return false;
    inst.finish = finish;
    this.build(inst, true);
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
    for (const id of this.lettered) this.build(this.props.get(id)!, true);
    this.refresh();
  }

  /** Rebuild every prop and joint, keeping their paint (resampled into the new atlases after a paint detail change). */
  rebuildAll() {
    for (const inst of this.props.values()) this.build(inst, true);
    for (const [key, { joint, b: old }] of this.joints) {
      disposeProp(old, this.paint);
      const b = this.buildJoint(key, joint);
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
    const above = !!def.stacks?.above && this.findAt(def, [pos[0], pos[1] + (def.vSnap ?? V_MODULE), pos[2]], rot) !== undefined;
    const below = !!def.stacks?.below && this.column(def, pos, rot).some((p) => p.pos[1] < pos[1] - 0.01);
    return { above, below };
  }

  private create(data: PropData, build = true): PropInstance | null {
    // Levels saved before variants name some props by their old types.
    const [type, variant] = renamed(data.type, data.variant);
    const def = defOf(type, variant);
    if (!def) {
      console.warn(`unknown prop type "${data.type}"`);
      return null;
    }
    // Its own id when it has a free one (a format 3 level, undo), else the next.
    const id = Number.isInteger(data.id) && data.id! > 0 && !this.props.has(data.id!) ? data.id! : this.nextId;
    this.nextId = Math.max(this.nextId, id + 1);
    const inst: PropInstance = { id, type, variant: def.variant, pos: [...data.pos], rot: (((data.rot ?? 0) % 4) + 4) % 4, adjust: data.adjust, text: data.text, finish: data.finish };
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
    const def = defOf(inst.type, inst.variant)!;
    const seed = Math.abs(Math.round(inst.pos[0] * 7 + inst.pos[2] * 13));
    const adjust = inst.adjust ?? def.adjust?.initial() ?? 0;
    const ctx = { seed, pos: inst.pos, adjust, text: inst.text ?? def.text ?? '', finish: inst.finish, ...this.stackContext(def, inst.pos, inst.rot) };
    const pieces = def.build(ctx);
    if (pieces.some((p) => 'mat' in p && p.mat.letters)) this.lettered.add(inst.id);
    else this.lettered.delete(inst.id);
    const b = buildProp(inst.id, `p${inst.id}`, pieces, inst.pos, inst.rot, this.paint);
    this.root.add(b.group);
    this.built.set(inst.id, b);
    if (old && (resample || samePaintFaces(old, b))) this.carryPaint(old, b);
  }

  /**
   * Stacking props depend on their neighbor one level up (fire escape) or down
   * (building block): rebuild the neighbors whose shape changes.
   */
  private rebuildStack(inst: PropInstance) {
    const def = defOf(inst.type, inst.variant)!;
    const s = def.stacks;
    if (!s) return;
    const below = s.above ? this.findAt(def, [inst.pos[0], inst.pos[1] - (def.vSnap ?? V_MODULE), inst.pos[2]], inst.rot) : undefined;
    if (below) this.build(below);
    // Only the lowest prop above can change (it may become the bottom of the column).
    if (s.below) {
      const above = this.column(def, inst.pos, inst.rot).filter((p) => p.pos[1] > inst.pos[1] + 0.01);
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
    this.built.delete(id);
    this.lettered.delete(id);
    this.props.delete(id);
    if (inst.owner !== undefined) this.runtime.delete(inst.owner);
    this.rebuildStack(inst);
    return true;
  }

  /** Props of this type and variant in the same vertical column (same x, z). */
  private column(def: PropDef, pos: V3, rot: number) {
    const anyRot = def.place === 'cell';
    return [...this.props.values()].filter((p) => isA(p, def) && (anyRot || p.rot === rot) && Math.abs(p.pos[0] - pos[0]) < 0.01 && Math.abs(p.pos[2] - pos[2]) < 0.01);
  }

  /** Cell props fill the same space whatever their facing, so their rotation doesn't matter. */
  private findAt(def: PropDef, pos: V3, rot: number) {
    const anyRot = def.place === 'cell';
    for (const p of this.props.values()) {
      if (isA(p, def) && (anyRot || p.rot === rot) && pos.every((v, i) => Math.abs(v - p.pos[i]) < 0.01)) return p;
    }
    return undefined;
  }

  /** Update joints, flat arrays and batches after a change. */
  private refresh() {
    const want = computeJoints(this.props.values());
    for (const [key, j] of this.joints) {
      if (want.has(key)) continue;
      disposeProp(j.b, this.paint);
      this.joints.delete(key);
    }
    for (const [key, joint] of want) {
      const old = this.joints.get(key);
      if (old && sameFinish(old.joint, joint)) continue;
      // New, or its finish changed: (re)built, its paint carried over.
      const b = this.buildJoint(key, joint);
      if (old) {
        this.carryPaint(old.b, b);
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
    const b = buildProp(-1, `j${key}`, jointPieces(joint), joint.pos, 0, this.paint);
    this.root.add(b.group);
    return b;
  }

  private allBuilt: BuiltProp[] = [];
}

/** Is a prop of this def's type and variant, or any variant with `stacks.across` (stacking only joins the same prop)? */
const isA = (p: PropInstance, def: PropDef) => p.type === def.type && (!!def.stacks?.across || p.variant === def.variant);

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
