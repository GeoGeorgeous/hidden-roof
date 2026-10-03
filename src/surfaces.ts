import * as THREE from 'three';
import { PAINT } from './config';

// Paintable primitives. Each primitive gets one paint atlas: every face is laid
// out at PAINT.texelsPerMeter, so paint looks identical on any surface size.
// Geometry is built directly in world space (meshes stay at the origin).

/** A face's region inside the atlas, in texels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Vertical face with texel +y = world up: paint can run down it (see paint-drips.ts). */
  upright?: boolean;
}

export interface SurfaceGeometry {
  geometry: THREE.BufferGeometry;
  atlasW: number;
  atlasH: number;
  rects: Rect[];
  /** Triangle index -> rect index, used to clip paint stamps to one face. */
  triToRect: Uint16Array;
}

const PAD = 1;

interface FaceSpec {
  /** World-space corners: origin, +u edge, +v edge (u = right, v = up when facing the face). */
  origin: THREE.Vector3;
  uAxis: THREE.Vector3; // full length vector
  vAxis: THREE.Vector3;
  normal: THREE.Vector3;
}

/** Collects faces of one or more primitives into one geometry with one paint atlas. */
export class SurfaceBuilder {
  /** Per-vertex tint (linear RGB) and emissive applied to the vertices added next. */
  tint: [number, number, number] = [1, 1, 1];
  emissive = 0;
  private tints: number[] = [];
  private emissives: number[] = [];
  positions: number[] = [];
  normals: number[] = [];
  uvs: number[] = []; // atlas texels for now, normalized at the end
  baseUvs: number[] = [];
  indices: number[] = [];
  rects: Rect[] = [];
  triRect: number[] = [];

  /** Reserve an atlas rect for a face of the given size in meters. */
  addRect(uMeters: number, vMeters: number): number {
    const d = PAINT.texelsPerMeter;
    this.rects.push({ x: 0, y: 0, w: Math.max(1, Math.ceil(uMeters * d)), h: Math.max(1, Math.ceil(vMeters * d)) });
    return this.rects.length - 1;
  }

  vertex(p: THREE.Vector3, n: THREE.Vector3, rect: number, u: number, v: number, bu: number, bv: number): number {
    this.positions.push(p.x, p.y, p.z);
    this.tints.push(...this.tint);
    this.emissives.push(this.emissive);
    this.normals.push(n.x, n.y, n.z);
    // Store rect index + local fraction; resolved after packing.
    this.uvs.push(rect + u * 0.999, v);
    this.baseUvs.push(bu, bv);
    return this.positions.length / 3 - 1;
  }

  tri(a: number, b: number, c: number, rect: number) {
    this.indices.push(a, b, c);
    this.triRect.push(rect);
  }

  build(pack = true): SurfaceGeometry {
    // Decor geometry has no paint atlas; give it a dummy one.
    const { w: atlasW, h: atlasH } = pack ? packRects(this.rects) : stubRects(this.rects);
    // Resolve atlas UVs.
    const uv = new Float32Array(this.uvs.length);
    for (let i = 0; i < this.uvs.length; i += 2) {
      const ri = Math.floor(this.uvs[i]);
      const fu = (this.uvs[i] - ri) / 0.999;
      const fv = this.uvs[i + 1];
      const r = this.rects[ri];
      uv[i] = (r.x + fu * r.w) / atlasW;
      uv[i + 1] = (r.y + fv * r.h) / atlasH;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('baseUv', new THREE.Float32BufferAttribute(this.baseUvs, 2));
    g.setAttribute('tint', new THREE.Float32BufferAttribute(this.tints, 3));
    g.setAttribute('emissive', new THREE.Float32BufferAttribute(this.emissives, 1));
    g.setIndex(this.indices);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return { geometry: g, atlasW, atlasH, rects: this.rects, triToRect: Uint16Array.from(this.triRect) };
  }

  /** Flat quad face. Base UVs are world-aligned so base textures line up across objects. */
  quad(f: FaceSpec) {
    const uLen = f.uAxis.length();
    const vLen = f.vAxis.length();
    const rect = this.addRect(uLen, vLen);
    if (f.vAxis.y > 0 && Math.abs(f.normal.y) < 0.01) this.rects[rect].upright = true;
    const uDir = f.uAxis.clone().normalize();
    const vDir = f.vAxis.clone().normalize();
    // World-aligned base coords: project origin onto the face axes.
    const bu0 = f.origin.dot(uDir);
    const bv0 = f.origin.dot(vDir);
    const p = new THREE.Vector3();
    const idx: number[] = [];
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      p.copy(f.origin).addScaledVector(f.uAxis, u).addScaledVector(f.vAxis, v);
      idx.push(this.vertex(p, f.normal, rect, u, v, bu0 + u * uLen, bv0 + v * vLen));
    }
    this.tri(idx[0], idx[1], idx[2], rect);
    this.tri(idx[0], idx[2], idx[3], rect);
  }
}

/** Shelf packing. Returns atlas size; writes rect positions in place. */
function packRects(rects: Rect[]): { w: number; h: number } {
  const order = rects.map((_, i) => i).sort((a, b) => rects[b].h - rects[a].h);
  let area = 0;
  let maxW = 0;
  for (const r of rects) {
    area += (r.w + PAD * 2) * (r.h + PAD * 2);
    maxW = Math.max(maxW, r.w + PAD * 2);
  }
  const width = Math.min(PAINT.maxTextureSize, Math.max(maxW, Math.ceil(Math.sqrt(area) * 1.15)));
  let x = 0;
  let y = 0;
  let shelfH = 0;
  for (const i of order) {
    const r = rects[i];
    const w = r.w + PAD * 2;
    const h = r.h + PAD * 2;
    if (x + w > width) {
      x = 0;
      y += shelfH;
      shelfH = 0;
    }
    r.x = x + PAD;
    r.y = y + PAD;
    x += w;
    shelfH = Math.max(shelfH, h);
  }
  const height = y + shelfH;
  if (height > PAINT.maxTextureSize || width > PAINT.maxTextureSize) {
    console.warn(`paint atlas ${width}x${height} exceeds max texture size`);
  }
  return { w: width, h: height };
}

function stubRects(rects: Rect[]) {
  for (const r of rects) {
    r.x = 0;
    r.y = 0;
  }
  return { w: Math.max(1, ...rects.map((r) => r.w)), h: Math.max(1, ...rects.map((r) => r.h)) };
}

export type BoxFace = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

/** Axis-aligned box from min/max corners. `skip` omits hidden faces (saves texture space). */
export function boxSurface(min: THREE.Vector3, max: THREE.Vector3, skip: BoxFace[] = [], paintable = true): SurfaceGeometry {
  const b = new SurfaceBuilder();
  addBox(b, min, max, skip);
  return b.build(paintable);
}

export function addBox(b: SurfaceBuilder, min: THREE.Vector3, max: THREE.Vector3, skip: BoxFace[] = []) {
  const s = new THREE.Vector3().subVectors(max, min);
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const faces: Record<BoxFace, FaceSpec> = {
    '+z': { origin: V(min.x, min.y, max.z), uAxis: V(s.x, 0, 0), vAxis: V(0, s.y, 0), normal: V(0, 0, 1) },
    '-z': { origin: V(max.x, min.y, min.z), uAxis: V(-s.x, 0, 0), vAxis: V(0, s.y, 0), normal: V(0, 0, -1) },
    '+x': { origin: V(max.x, min.y, max.z), uAxis: V(0, 0, -s.z), vAxis: V(0, s.y, 0), normal: V(1, 0, 0) },
    '-x': { origin: V(min.x, min.y, min.z), uAxis: V(0, 0, s.z), vAxis: V(0, s.y, 0), normal: V(-1, 0, 0) },
    '+y': { origin: V(min.x, max.y, max.z), uAxis: V(s.x, 0, 0), vAxis: V(0, 0, -s.z), normal: V(0, 1, 0) },
    '-y': { origin: V(min.x, min.y, min.z), uAxis: V(s.x, 0, 0), vAxis: V(0, 0, s.z), normal: V(0, -1, 0) },
  };
  for (const key of Object.keys(faces) as BoxFace[]) {
    if (!skip.includes(key)) b.quad(faces[key]);
  }
}

export type Axis = 'x' | 'y' | 'z';

/**
 * Cylinder along an axis. `start` is the center of the first cap.
 * The side is unwrapped by arc length so texel density stays constant.
 */
export function cylinderSurface(
  start: THREE.Vector3,
  axis: Axis,
  length: number,
  radius: number,
  segments = 16,
  caps: [boolean, boolean] = [true, true],
  /** Radius at the far end; defaults to `radius`. Texel density follows the wider end. */
  radiusEnd = radius,
  paintable = true,
): SurfaceGeometry {
  const b = new SurfaceBuilder();
  addCylinder(b, start, axis, length, radius, segments, caps, radiusEnd);
  return b.build(paintable);
}

export function addCylinder(
  b: SurfaceBuilder,
  start: THREE.Vector3,
  axis: Axis,
  length: number,
  radius: number,
  segments = 16,
  caps: [boolean, boolean] = [true, true],
  radiusEnd = radius,
) {
  const A = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
  // Two perpendicular axes forming a right-handed frame with A.
  const P = axis === 'y' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const Q = new THREE.Vector3().crossVectors(A, P); // so that P x Q = A
  P.crossVectors(Q, A);
  const circ = Math.PI * 2 * Math.max(radius, radiusEnd);
  const slant = Math.hypot(length, radius - radiusEnd);
  const side = b.addRect(circ, slant);
  if (axis === 'y' && radius === radiusEnd) b.rects[side].upright = true;
  const along = start.dot(A);
  const ring: number[][] = [];
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const ang = t * Math.PI * 2;
    n.copy(P).multiplyScalar(Math.cos(ang)).addScaledVector(Q, Math.sin(ang));
    const row: number[] = [];
    // Tilt the normal outward on tapered cylinders.
    const sn = n.clone().multiplyScalar(length).addScaledVector(A, radius - radiusEnd).normalize();
    for (let j = 0; j <= 1; j++) {
      const r = j === 0 ? radius : radiusEnd;
      p.copy(start).addScaledVector(n, r).addScaledVector(A, j * length);
      row.push(b.vertex(p, sn, side, t, j, t * Math.PI * 2 * r, along + j * slant));
    }
    ring.push(row);
  }
  for (let i = 0; i < segments; i++) {
    const [a0, a1] = ring[i];
    const [b0, b1] = ring[i + 1];
    b.tri(a0, b0, b1, side);
    b.tri(a0, b1, a1, side);
  }
  // Caps: planar mapped discs.
  for (let c = 0; c < 2; c++) {
    if (!caps[c]) continue;
    const cr = c === 0 ? radius : radiusEnd;
    const rect = b.addRect(cr * 2, cr * 2);
    const sign = c === 0 ? -1 : 1;
    const normal = A.clone().multiplyScalar(sign);
    const center = start.clone().addScaledVector(A, c * length);
    const capU = c === 0 ? Q : P; // keep winding consistent
    const capV = c === 0 ? P : Q;
    const ci = b.vertex(center, normal, rect, 0.5, 0.5, center.dot(capU), center.dot(capV));
    const rim: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const ang = (i / segments) * Math.PI * 2;
      const cu = Math.cos(ang);
      const cv = Math.sin(ang);
      p.copy(center).addScaledVector(capU, cu * cr).addScaledVector(capV, cv * cr);
      rim.push(b.vertex(p, normal, rect, 0.5 + cu * 0.5, 0.5 + cv * 0.5, p.dot(capU), p.dot(capV)));
    }
    for (let i = 0; i < segments; i++) b.tri(ci, rim[i], rim[i + 1], rect);
  }
}
