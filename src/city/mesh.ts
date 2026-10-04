import * as THREE from 'three';
import type { Facade } from '../render/ink/facade';
import type { UvRect } from '../render/ink/glyphs';

// Merged geometry for the city around the level, in chunks (so the camera
// culls what's out of view and draws near chunks first), all drawn with the
// one surface material. City
// geometry only stores what it uses (position, normal, tint, facade, and for
// signs the lettering UVs: CityMesh(true), drawn with the glyph atlas); the
// attributes the surface shader also reads (paint and base UVs, swing, baked
// light...) point at shared all-zero buffers, uploaded once for every chunk.

export type V3 = [number, number, number];

/** Chunk size (m): one draw call per chunk in view. */
const CHUNK = 160;
const PLAIN: Facade = [0, 0, 0, 0];

interface Chunk {
  pos: number[];
  nrm: number[];
  tint: number[];
  fac: number[];
  uv: number[];
  idx: number[];
}

export class CityMesh {
  private chunks = new Map<string, Chunk>();
  private tint = [0.6, 0.6, 0.6];
  private facade: Facade = PLAIN;
  private chunk: Chunk = this.at(0, 0);
  private rect: UvRect = [0, 0, 0, 0];

  /** With `withUv`, every quad maps the lettering rect set by `letters` (signs). */
  constructor(private withUv = false) {}

  /** Lettering (glyph atlas rect) for the sign faces added next. */
  letters(rect: UvRect) {
    this.rect = rect;
    return this;
  }

  /** Gray (sRGB 0..1) and facade of the pieces added next, and the chunk they go to (by a point in it). */
  set(gray: number, facade: Facade = PLAIN, x?: number, z?: number) {
    const l = new THREE.Color(gray, gray, gray).convertSRGBToLinear().r;
    this.tint = [l, l, l];
    this.facade = facade;
    if (x !== undefined && z !== undefined) this.chunk = this.at(x, z);
    return this;
  }

  private at(x: number, z: number) {
    const key = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
    let c = this.chunks.get(key);
    if (!c) this.chunks.set(key, (c = { pos: [], nrm: [], tint: [], fac: [], uv: [], idx: [] }));
    return c;
  }

  private quad(a: V3, b: V3, c: V3, d: V3, n: V3) {
    const ch = this.chunk;
    const base = ch.pos.length / 3;
    for (const p of [a, b, c, d]) {
      ch.pos.push(p[0], p[1], p[2]);
      ch.nrm.push(n[0], n[1], n[2]);
      ch.tint.push(...this.tint);
      ch.fac.push(...this.facade);
    }
    if (this.withUv) {
      const [u0, v0, u1, v1] = this.rect;
      ch.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    }
    // Wind counter-clockwise as seen from the side the normal points to.
    const cx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    const cy = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const cz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) ch.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else ch.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }

  /** Axis-aligned box; `bottom` false skips the underside (most city boxes sit on something). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, bottom = false) {
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
    if (bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
  }

  /** Capped cylinder along y (axis 'y') or lying along x / z, from its base center. */
  cyl(base: V3, axis: 'x' | 'y' | 'z', len: number, r: number, seg = 10) {
    const ax = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    const u = ax === 1 ? 0 : 1; // the two axes across the cylinder
    const v = ax === 2 ? 0 : 2;
    const pt = (ang: number, t: number): V3 => {
      const p: V3 = [...base];
      p[ax] += t * len;
      p[u] += Math.cos(ang) * r;
      p[v] += Math.sin(ang) * r;
      return p;
    };
    const nr = (ang: number): V3 => {
      const n: V3 = [0, 0, 0];
      n[u] = Math.cos(ang);
      n[v] = Math.sin(ang);
      return n;
    };
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      // Flat-shaded sides: each facet reads as a crisp drawn plane.
      this.quad(pt(a0, 0), pt(a1, 0), pt(a1, 1), pt(a0, 1), nr(am));
    }
    // Caps as triangle fans folded into quads (center repeated).
    for (const t of [0, 1]) {
      const n: V3 = [0, 0, 0];
      n[ax] = t ? 1 : -1;
      const c: V3 = [...base];
      c[ax] += t * len;
      for (let i = 0; i < seg; i += 2) {
        const p0 = pt((i / seg) * Math.PI * 2, t);
        const p1 = pt(((i + 1) / seg) * Math.PI * 2, t);
        const p2 = pt(((i + 2) / seg) * Math.PI * 2, t);
        this.quad(c, p0, p1, p2, n);
      }
    }
  }

  /** One mesh per chunk. */
  build(material: THREE.Material): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const ch of this.chunks.values()) {
      if (!ch.idx.length) continue;
      const n = ch.pos.length / 3;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(ch.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(ch.nrm, 3));
      g.setAttribute('tint', new THREE.Float32BufferAttribute(ch.tint, 3));
      g.setAttribute('facade', new THREE.Float32BufferAttribute(ch.fac, 4));
      if (this.withUv) g.setAttribute('baseUv', new THREE.Float32BufferAttribute(ch.uv, 2));
      g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(ch.idx, 1) : new THREE.Uint16BufferAttribute(ch.idx, 1));
      // Each chunk sits at its own center, so the opaque sort (render/post.ts)
      // draws near chunks first and the depth test skips the towers behind them.
      g.computeBoundingSphere();
      const c = g.boundingSphere!.center.clone();
      g.translate(-c.x, -c.y, -c.z);
      const m = new THREE.Mesh(g, material);
      m.position.copy(c);
      m.updateMatrix();
      m.matrixAutoUpdate = false;
      // After the level (render order sorts before material and depth): the level is
      // near and hides much of the city, so the city's hidden pixels are skipped.
      m.renderOrder = 1;
      m.raycast = () => {};
      out.push(m);
    }
    return out;
  }
}
