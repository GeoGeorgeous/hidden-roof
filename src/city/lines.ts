import * as THREE from 'three';
import { inkUniforms } from '../render/ink/tone';
import { shared } from '../materials';
import type { V3 } from './mesh';

// Pen lines: thin steel (lattice frames, bracing, railings, masts, ladders)
// and wires, drawn as one-pixel GL lines in ink, whatever their distance:
// exactly the fine line of a pen, at a few bytes per line. Each line has its
// own weight (opacity), range (it's gone beyond it) and feature size: the
// spacing of the structure it belongs to (a lattice's panel, a railing's
// height). When that size shrinks below a few pixels on screen the line
// fades, so far lattices keep their outline (legs, chords: big sizes) but lose
// their bracing instead of turning into a black mass. One draw
// call per chunk; depth-tested against the world, but they don't write depth
// (so the outline pass ignores them).

const CHUNK = 160;

const material = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: {
    uInkColor: inkUniforms.uInkColor,
    uFade: inkUniforms.uFade,
    uVoid: inkUniforms.uVoid,
    uCloudBase: shared.uCloudBase,
    uCloudFade: shared.uCloudFade,
    uLineFade: { value: 1 },
    uPxPerM: { value: 300 },
  },
  vertexShader: /* glsl */ `
    attribute vec3 line; // weight, range (m), feature size (m)
    uniform float uPxPerM;
    uniform float uFade;
    uniform vec2 uVoid;
    uniform float uCloudBase;
    uniform float uCloudFade;
    uniform float uLineFade;
    varying float vAlpha;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      float d = distance(wp.xyz, cameraPosition);
      float range = line.y * uLineFade;
      float px = line.z * uPxPerM / max(d, 0.1);
      vAlpha = line.x * exp(-uFade * d) * (1.0 - smoothstep(range * 0.4, range, d)) * smoothstep(3.0, 10.0, px)
        * (1.0 - smoothstep(uCloudBase, uCloudBase + uCloudFade, wp.y));
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uInkColor;
    varying float vAlpha;
    void main() {
      if (vAlpha < 0.01) discard;
      gl_FragColor = vec4(uInkColor, vAlpha);
    }`,
});

/** Multiplier for every line's range (SKYLINE.lineRange, live). */
export function setLineRange(k: number) {
  material.uniforms.uLineFade.value = k;
}

/** Pixels per meter at 1 m from the camera: drawing-buffer height / (2 tan(fov / 2)). */
export function setLinePointScale(scale: number) {
  material.uniforms.uPxPerM.value = scale;
}

interface Chunk {
  pos: number[];
  line: number[];
}

export class Lines {
  private chunks = new Map<string, Chunk>();
  private weight = 1;
  private range = 300;
  private size = 2;

  /** Opacity and fade-out distance of the lines added next. */
  style(weight: number, range: number) {
    this.weight = weight;
    this.range = range;
    return this;
  }

  /** Feature size (m) of the lines added next: they fade when it gets a few pixels small. */
  sized(size: number) {
    this.size = size;
    return this;
  }

  seg(a: V3, b: V3) {
    const key = `${Math.floor((a[0] + b[0]) / 2 / CHUNK)},${Math.floor((a[2] + b[2]) / 2 / CHUNK)}`;
    let c = this.chunks.get(key);
    if (!c) this.chunks.set(key, (c = { pos: [], line: [] }));
    c.pos.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    c.line.push(this.weight, this.range, this.size, this.weight, this.range, this.size);
  }

  /** A polyline through the points. */
  path(points: V3[]) {
    for (let i = 1; i < points.length; i++) this.seg(points[i - 1], points[i]);
  }

  /** Wire sagging `sag` m in the middle, in `n` segments. */
  wire(a: V3, b: V3, sag: number, n = 10) {
    const size = this.size;
    this.sized(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    const pts: V3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
    }
    this.path(pts);
    this.sized(size);
  }

  /**
   * Lattice girder between two parallel rails a0-a1 and b0-b1: the rails,
   * `n` panels of struts across and alternating diagonals.
   */
  truss(a0: V3, a1: V3, b0: V3, b1: V3, n: number) {
    const lerp = (p: V3, q: V3, t: number): V3 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
    const size = this.size;
    const len = Math.hypot(a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]);
    const depth = Math.hypot(b0[0] - a0[0], b0[1] - a0[1], b0[2] - a0[2]);
    // Chords last as long as the girder is a few pixels deep; struts while a panel is.
    this.sized(Math.max(depth * 2, len / 4));
    this.seg(a0, a1);
    this.seg(b0, b1);
    this.sized(Math.min(depth, len / n) * 1.5);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.seg(lerp(a0, a1, t), lerp(b0, b1, t));
      if (i < n) {
        const t2 = (i + 1) / n;
        if (i % 2) this.seg(lerp(a0, a1, t), lerp(b0, b1, t2));
        else this.seg(lerp(b0, b1, t), lerp(a0, a1, t2));
      }
    }
    this.sized(size);
  }

  /** Square lattice mast (4 legs) from a base center, width w at the bottom narrowing to wTop, braced every `step` m. */
  mast(x: number, y: number, z: number, h: number, w: number, wTop: number, step: number) {
    const n = Math.max(1, Math.round(h / step));
    const corner = (i: number, t: number): V3 => {
      const hw = (w + (wTop - w) * t) / 2;
      const sx = i === 0 || i === 3 ? -1 : 1;
      const sz = i < 2 ? -1 : 1;
      return [x + sx * hw, y + h * t, z + sz * hw];
    };
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      this.truss(corner(i, 0), corner(i, 1), corner(j, 0), corner(j, 1), n);
    }
  }

  /** Ladder: two rails and rungs every 0.4 m, from a to a + (0, h, 0), `w` wide along x or z. */
  ladder(x: number, y: number, z: number, h: number, alongX: boolean, w = 0.6) {
    const ox = alongX ? w / 2 : 0;
    const oz = alongX ? 0 : w / 2;
    const size = this.size;
    this.sized(w * 2);
    this.seg([x - ox, y, z - oz], [x - ox, y + h, z - oz]);
    this.seg([x + ox, y, z + oz], [x + ox, y + h, z + oz]);
    this.sized(0.8);
    for (let r = 0.4; r < h; r += 0.4) this.seg([x - ox, y + r, z - oz], [x + ox, y + r, z + oz]);
    this.sized(size);
  }

  /** Railing around a rectangle at height y: top rail, mid rail, posts. */
  railing(x0: number, z0: number, x1: number, z1: number, y: number, h = 1.1, post = 1.6) {
    const size = this.size;
    this.sized(h * 2);
    const c: V3[] = [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]];
    for (let i = 0; i < 4; i++) {
      const a = c[i];
      const b = c[(i + 1) % 4];
      this.seg([a[0], y + h, a[2]], [b[0], y + h, b[2]]);
      this.seg([a[0], y + h * 0.5, a[2]], [b[0], y + h * 0.5, b[2]]);
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const n = Math.max(1, Math.round(len / post));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const px = a[0] + (b[0] - a[0]) * t;
        const pz = a[2] + (b[2] - a[2]) * t;
        this.seg([px, y, pz], [px, y + h, pz]);
      }
    }
    this.sized(size);
  }

  build(): THREE.LineSegments[] {
    const out: THREE.LineSegments[] = [];
    for (const c of this.chunks.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(c.pos, 3));
      g.setAttribute('line', new THREE.Float32BufferAttribute(c.line, 3));
      g.computeBoundingSphere();
      const l = new THREE.LineSegments(g, material);
      l.matrixAutoUpdate = false;
      l.raycast = () => {};
      out.push(l);
    }
    return out;
  }
}
