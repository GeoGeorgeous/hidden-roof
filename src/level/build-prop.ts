import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeSurfaceMaterial, swingGeometry, tintGeometry, type SurfaceMaterial } from '../materials';
import type { PaintSurface, PaintSystem } from '../painting';
import type { Ladder } from '../player';
import { addBox, addCylinder, boxSurface, cylinderSurface, SurfaceBuilder, type Axis, type BoxFace, type SurfaceGeometry } from '../surfaces';
import { M, type BoxPiece, type CylPiece, type Mat, type Piece, type Swing, type V3 } from '../kit/pieces';
import { LIGHTS, type LightKind } from '../config';
import { setHex } from '../hex-color';
import type { Track } from '../render/cctv-track';
import type { Facade } from '../render/ink/facade';

// Turns a prop's pieces into world-space geometry, colliders and climb volumes.
// Rotations are multiples of 90°, so every box stays axis-aligned and its
// collider is exactly its visual box.

export interface PropInstance {
  id: number;
  type: string;
  pos: V3;
  /** Quarter turns around Y (0..3). */
  rot: number;
  /** Per-instance setting (PropDef.adjust), when changed in build mode. */
  adjust?: number;
}

/**
 * A light emitter in world space. `pos`, `dir` and `color` follow LIGHTS[kind]
 * live (see syncAnchor), so tuning a light needs no rebuild.
 */
export interface LightAnchor {
  kind: LightKind;
  /** Default emitter spot (world) and the prop's quarter turns. */
  base: THREE.Vector3;
  rot: number;
  /** Per-instance aim (prop-local) that overrides LIGHTS[kind].dir, e.g. a tilted floodlight. */
  aim: V3 | null;
  mirrorX: boolean;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  color: THREE.Color;
  /** Fixed glow positions, or null: one glow at `pos`. */
  glows: THREE.Vector3[] | null;
  /** Neon flicker seed (0 = steady). */
  flicker: number;
  /** CCTV light: turns with its head and only shines while it follows the player (render/cctv-track.ts). */
  track: Track | null;
  /** 0..1 strength right now (tracking lights fade with the player's distance); 1 for every other light. */
  level: number;
}

/** Apply LIGHTS[kind] (offset, aim, color) to an anchor. Runs for every light every frame, so it allocates nothing. */
export function syncAnchor(a: LightAnchor) {
  const s = LIGHTS[a.kind];
  const m = a.mirrorX ? -1 : 1;
  const d = a.aim ?? s.dir;
  turn(a.pos, s.offset[0] * m, s.offset[1], s.offset[2], a.rot).add(a.base);
  turn(a.dir, d[0] * m, d[1], d[2], a.rot).normalize();
  setHex(a.color, s.color);
}

/**
 * Smoke source or humming fan in world space (see kit/pieces EmitterPiece), or
 * 'metal': the top of a metal piece, where raindrops ping (added automatically).
 */
export interface Emitter {
  kind: 'smoke' | 'fan' | 'metal';
  pos: THREE.Vector3;
  dir: THREE.Vector3;
}

export interface Expanded {
  paint: { geo: SurfaceGeometry; mat: Mat }[];
  decor: { geo: THREE.BufferGeometry; mat: Mat }[];
  colliders: THREE.Box3[];
  /** Colliders that block light (see-through pieces like chain-link don't). */
  occluders: THREE.Box3[];
  ladders: Ladder[];
  lights: LightAnchor[];
  emitters: Emitter[];
}

export interface BuiltProp {
  /** Paint meshes (visible) + per-material decor proxies (invisible, for raycasts). */
  group: THREE.Group;
  /** Decor proxies, merged level-wide for drawing (see level/batches.ts). */
  decor: THREE.Mesh[];
  colliders: THREE.Box3[];
  /** Colliders that cast baked shadows. */
  occluders: THREE.Box3[];
  ladders: Ladder[];
  lights: LightAnchor[];
  emitters: Emitter[];
  solids: THREE.Mesh[];
  paint: PaintSurface[];
  bounds: THREE.Box3;
}

const COS = [1, 0, -1, 0];
const SIN = [0, 1, 0, -1];

export function rotate(v: V3, r: number) {
  return turn(new THREE.Vector3(), v[0], v[1], v[2], r);
}

/** (x, y, z) turned `r` quarter turns around Y, into `out`. */
function turn(out: THREE.Vector3, x: number, y: number, z: number, r: number) {
  return out.set(x * COS[r] + z * SIN[r], y, -x * SIN[r] + z * COS[r]);
}

const FACE_DIR: Record<BoxFace, V3> = { '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 1, 0], '-y': [0, -1, 0], '+z': [0, 0, 1], '-z': [0, 0, -1] };
function rotateFace(f: BoxFace, r: number): BoxFace {
  const d = rotate(FACE_DIR[f], r);
  if (Math.abs(d.x) > 0.5) return d.x > 0 ? '+x' : '-x';
  if (Math.abs(d.y) > 0.5) return d.y > 0 ? '+y' : '-y';
  return d.z > 0 ? '+z' : '-z';
}

/** Big flat faces are paintable, small details are decor. */
function boxIsPaintable(p: BoxPiece) {
  if (p.paint !== 'auto') return p.paint;
  const d = [p.max[0] - p.min[0], p.max[1] - p.min[1], p.max[2] - p.min[2]];
  const pairs = [[d[0], d[1]], [d[0], d[2]], [d[1], d[2]]];
  return pairs.some(([a, b]) => Math.min(a, b) >= 0.5 && a * b >= 1.2);
}
function cylIsPaintable(p: CylPiece) {
  if (p.paint !== 'auto') return p.paint;
  return Math.max(p.r, p.r2 ?? p.r) >= 0.3 && p.len >= 1;
}

export const matKey = (m: Mat) => `${m.tex}|${m.tile ?? ''}|${m.alpha ?? ''}`;
export function material(m: Mat) {
  return makeSurfaceMaterial({ tex: m.tex, tileMeters: m.tile, alphaTest: m.alpha });
}
const decorMaterials = new Map<string, SurfaceMaterial>();
export function decorMaterial(m: Mat) {
  const k = matKey(m);
  let mat = decorMaterials.get(k);
  if (!mat) decorMaterials.set(k, (mat = material(m)));
  return mat;
}

const NO_FACADE: Facade = [0, 0, 0, 0];

/** Materials that ring when rain hits them. */
const METALS = new Set<Mat>([M.steel, M.metal, M.galv, M.ac, M.rust]);

/** World-space geometry for pieces. With allowPaint=false everything is decor (ghost preview). */
export function expandPieces(pieces: Piece[], pos: V3, rot: number, allowPaint = true): Expanded {
  const r = ((rot % 4) + 4) % 4;
  const origin = new THREE.Vector3(...pos);
  const at = (v: V3) => rotate(v, r).add(origin);
  const restFacing = rotate([0, 0, -1], r); // tracking heads face out of the wall at rest
  const out: Expanded = { paint: [], decor: [], colliders: [], occluders: [], ladders: [], lights: [], emitters: [] };
  const collide = (mat: Mat, boxes: THREE.Box3[]) => {
    out.colliders.push(...boxes);
    if (mat.alpha === undefined) out.occluders.push(...boxes);
  };
  const decor = (mat: Mat, geo: THREE.BufferGeometry, swing?: Swing) => {
    tintGeometry(geo, mat.tint, mat.emissive, mat.flicker ?? 0, mat.facade);
    if (swing) {
      const local: V3 = swing.axis === 'x' ? [1, 0, 0] : swing.axis === 'z' ? [0, 0, 1] : [0, 1, 0];
      const w = rotate(local, r);
      const axis = Math.abs(w.y) > 0.5 ? 0 : Math.abs(w.x) > 0.5 ? 1 : 2;
      if (swing.spin) swingGeometry(geo, at(swing.pivot), -1, swing.dir ?? 1, swing.phase ?? 0, axis);
      else swingGeometry(geo, at(swing.pivot), swing.amp, (Math.PI * 2) / swing.period, swing.phase ?? 0, axis, swing.track && axis === 0 ? [restFacing.x, restFacing.z, swing.track === 'lens' ? 2 : 1] : undefined);
    }
    out.decor.push({ geo, mat });
  };
  // Paintable pieces sharing a base material go into one atlas / one mesh (fewer draw calls).
  const painters = new Map<string, { b: SurfaceBuilder; mat: Mat }>();
  const painter = (mat: Mat) => {
    const k = matKey(mat);
    if (!painters.has(k)) painters.set(k, { b: new SurfaceBuilder(), mat });
    const e = painters.get(k)!;
    const c = new THREE.Color(mat.tint ?? '#ffffff');
    e.b.tint = [c.r, c.g, c.b];
    e.b.emissive = mat.emissive ?? 0;
    e.b.facade = mat.facade ?? NO_FACADE;
    e.b.letters = mat.letters ?? null;
    return e.b;
  };
  // Raindrop pings: one point per metal piece top, at most one per 1 m cell.
  const metalCells = new Set<string>();
  const metal = (mat: Mat, top: THREE.Vector3) => {
    if (!allowPaint || !METALS.has(mat)) return;
    const key = `${Math.round(top.x)},${Math.round(top.y)},${Math.round(top.z)}`;
    if (metalCells.has(key)) return;
    metalCells.add(key);
    out.emitters.push({ kind: 'metal', pos: top.clone(), dir: new THREE.Vector3() });
  };
  for (const p of pieces) {
    if (p.k === 'box') {
      const box = new THREE.Box3().setFromPoints([at(p.min), at(p.max)]);
      const skip = (p.skip ?? []).map((f) => rotateFace(f, r));
      if (allowPaint && !p.swing && boxIsPaintable(p)) addBox(painter(p.mat), box.min, box.max, skip);
      else decor(p.mat, boxSurface(box.min, box.max, skip, false, p.mat.letters).geometry, p.swing);
      if (p.collide && !p.swing) collide(p.mat, [box]);
      metal(p.mat, new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2));
    } else if (p.k === 'cyl') {
      const local: V3 = p.axis === 'x' ? [1, 0, 0] : p.axis === 'y' ? [0, 1, 0] : [0, 0, 1];
      const d = rotate(local, r);
      const axis: Axis = Math.abs(d.x) > 0.5 ? 'x' : Math.abs(d.y) > 0.5 ? 'y' : 'z';
      let base = at(p.base);
      let r1 = p.r;
      let r2 = p.r2 ?? p.r;
      if (d.x + d.y + d.z < 0) {
        base = base.addScaledVector(d, p.len);
        [r1, r2] = [r2, r1];
      }
      const seg = p.seg ?? 16;
      if (allowPaint && !p.swing && cylIsPaintable(p)) addCylinder(painter(p.mat), base, axis, p.len, r1, seg, [true, true], r2);
      else decor(p.mat, cylinderSurface(base, axis, p.len, r1, seg, [true, true], r2, false).geometry, p.swing);
      if (p.collide && !p.swing) collide(p.mat, cylinderColliders(base, axis, p.len, Math.max(r1, r2)));
      metal(p.mat, axis === 'y' ? base.clone().setY(base.y + p.len) : base.clone().setComponent('xyz'.indexOf(axis), base.getComponent('xyz'.indexOf(axis)) + p.len / 2).setY(base.y + r1));
    } else if (p.k === 'rod') {
      const a = at(p.a);
      const b = at(p.b);
      decor(p.mat, rodGeometry(a, b, p.r), p.swing);
      if (p.collide && !p.swing) collide(p.mat, rodColliders(a, b, p.r));
      metal(p.mat, a.y > b.y ? a : b);
    } else if (p.k === 'cone') {
      const g = new THREE.ConeGeometry(p.r, p.h, 16, 1, false);
      const c = at(p.base);
      g.translate(c.x, c.y + p.h / 2, c.z);
      decor(p.mat, g, p.swing);
    } else if (p.k === 'light') {
      const sw = p.swing?.track ? p.swing : undefined;
      const track: Track | null = sw ? { pivot: at(sw.pivot), fwd: new THREE.Vector2(restFacing.x, restFacing.z), amp: sw.amp, speed: (Math.PI * 2) / sw.period, phase: sw.phase ?? 0 } : null;
      const a: LightAnchor = { kind: p.kind, base: at(p.pos), rot: r, aim: p.dir ?? null, mirrorX: !!p.mirrorX, pos: new THREE.Vector3(), dir: new THREE.Vector3(), color: new THREE.Color(), glows: p.glows?.map(at) ?? null, flicker: p.flicker ?? 0, track, level: track ? 0 : 1 };
      syncAnchor(a);
      out.lights.push(a);
    } else if (p.k === 'emitter') {
      out.emitters.push({ kind: p.kind, pos: at(p.pos), dir: rotate(p.dir ?? [0, 0, 0], r) });
    } else {
      out.ladders.push({ volume: new THREE.Box3().setFromPoints([at(p.min), at(p.max)]), normal: rotate(p.normal, r) });
    }
  }
  for (const { b, mat } of painters.values()) out.paint.push({ geo: b.build(true), mat });
  return out;
}

/** Merge decor geometry per material key. */
export function mergeDecor(decor: Expanded['decor']) {
  const groups = new Map<string, { mat: Mat; geos: THREE.BufferGeometry[] }>();
  for (const d of decor) {
    const k = matKey(d.mat);
    if (!groups.has(k)) groups.set(k, { mat: d.mat, geos: [] });
    groups.get(k)!.geos.push(d.geo);
  }
  return [...groups.values()].map(({ mat, geos }) => {
    const g = mergeGeometries(geos);
    for (const s of geos) s.dispose();
    g.computeBoundingSphere();
    return { mat, geo: g };
  });
}

export function buildProp(id: number, pieces: Piece[], pos: V3, rot: number, paint: PaintSystem): BuiltProp {
  const ex = expandPieces(pieces, pos, rot);
  const out: BuiltProp = { group: new THREE.Group(), decor: [], colliders: ex.colliders, occluders: ex.occluders, ladders: ex.ladders, lights: ex.lights, emitters: ex.emitters, solids: [], paint: [], bounds: new THREE.Box3() };
  const add = (g: THREE.BufferGeometry, m: THREE.Material) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.propId = id;
    out.group.add(mesh);
    return mesh;
  };
  for (const { geo, mat } of ex.paint) {
    const m = material(mat);
    m.setPaintable(true);
    const mesh = add(swingGeometry(geo.geometry), m);
    mesh.castShadow = false; // the level-wide shadow proxy casts for all paint meshes
    out.solids.push(mesh);
    out.paint.push(paint.register(mesh, m, geo));
  }
  for (const { geo, mat } of mergeDecor(ex.decor)) {
    const mesh = add(geo, decorMaterial(mat));
    mesh.visible = false; // drawn by the level-wide batch
    mesh.userData.mat = mat;
    out.decor.push(mesh);
    if (mat.alpha === undefined) out.solids.push(mesh);
  }
  out.bounds.setFromObject(out.group);
  if (out.bounds.isEmpty()) out.bounds.setFromPoints([new THREE.Vector3(...pos)]);
  for (const c of out.colliders) out.bounds.union(c);
  return out;
}

export function disposeProp(b: BuiltProp, paint: PaintSystem) {
  for (const s of b.paint) paint.unregister(s.mesh);
  for (const o of b.group.children) {
    const m = o as THREE.Mesh;
    m.geometry.dispose();
    if (!b.decor.includes(m)) (m.material as THREE.Material).dispose();
  }
  b.group.removeFromParent();
}

export function rodGeometry(a: THREE.Vector3, b: THREE.Vector3, r: number) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, 6, 1, false);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}

/**
 * A sloped rod collides as a chain of small boxes along it. A mostly vertical
 * rod ends at its end points, so a post standing on a floor doesn't reach
 * into it (masts, sign towers and billboards could not be placed on floors).
 */
function rodColliders(a: THREE.Vector3, b: THREE.Vector3, r: number) {
  const n = Math.max(1, Math.ceil(a.distanceTo(b) / 0.3));
  const upright = Math.abs(b.y - a.y) > a.distanceTo(b) * 0.7;
  const lo = Math.min(a.y, b.y);
  const hi = Math.max(a.y, b.y);
  const out: THREE.Box3[] = [];
  for (let i = 0; i < n; i++) {
    const p = a.clone().lerp(b, i / n);
    const q = a.clone().lerp(b, (i + 1) / n);
    const box = new THREE.Box3().setFromPoints([p, q]).expandByScalar(r);
    if (upright) {
      box.min.y = Math.max(box.min.y, lo);
      box.max.y = Math.min(box.max.y, hi);
    }
    out.push(box);
  }
  return out;
}

/** Fat vertical cylinders collide as overlapping slabs; everything else as its AABB. */
function cylinderColliders(base: THREE.Vector3, axis: Axis, len: number, r: number) {
  if (axis !== 'y' || r < 0.8) {
    const end = base.clone().setComponent('xyz'.indexOf(axis), base.getComponent('xyz'.indexOf(axis)) + len);
    return [new THREE.Box3().setFromPoints([base, end]).expandByVector(new THREE.Vector3(axis === 'x' ? 0 : r, axis === 'y' ? 0 : r, axis === 'z' ? 0 : r))];
  }
  return [0.3, Math.PI / 4, Math.PI / 2 - 0.3].map((a) => {
    const hx = r * Math.cos(a);
    const hz = r * Math.sin(a);
    return new THREE.Box3(new THREE.Vector3(base.x - hx, base.y, base.z - hz), new THREE.Vector3(base.x + hx, base.y + len, base.z + hz));
  });
}
