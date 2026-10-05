import * as THREE from 'three';
import { PAINT } from './config';
import type { MipSize } from './paint-mips';
import { resampleAtlas } from './paint-resample';
import type { FacePoint, Rect, SurfaceGeometry } from './surfaces';
import type { SurfaceMaterial } from './materials';
import { SeamIndex, texelToWorld, worldToTexel, type SeamFace } from './paint-seams';
import { PaintGpu, type DirtyRect } from './paint-gpu';
import { PaintRaster, type Band } from './paint-raster';
import type { PaintOp } from './paint-ops';

// Paint lives in one RGBA texture per paintable surface (atlas of its faces).
// PaintSystem keeps the surfaces and turns stamps and rolls at face points into
// raster work (paint-raster.ts, CPU), carried across seams onto coplanar
// neighbors. Textures are created on the first hit and uploaded only on frames
// they change (paint-gpu.ts).

const seamPoint = new THREE.Vector3();
const seamTexel = new THREE.Vector2();
const atTexel = new THREE.Vector2();
const NONE: readonly never[] = [];

/** The face rect of a face point; the point's atlas texel coords go into atTexel (reused, so strokes allocate nothing). */
function faceTexel(s: PaintSurface, at: FacePoint): Rect {
  const r = s.geo.rects[at.rect];
  atTexel.set(r.x + at.u * r.w, r.y + at.v * r.h);
  return r;
}
/** A paint color: sRGB channels 0..1, the way paint textures store it (inventory/items.ts rgbOf). */
export type Rgb = readonly [number, number, number];
export interface PaintSurface {
  /** Stable name, the same on every client and at every paint detail: `p<prop id>#k` or `j<joint key>#k`, k = index in the prop's paint (level/build-prop.ts). */
  key: string;
  mesh: THREE.Mesh;
  material: SurfaceMaterial;
  geo: SurfaceGeometry;
  data: Uint8Array | null;
  /** Sizes of the texture's smaller levels for distant views (paint-mips.ts); empty until the first hit. */
  mips: MipSize[];
  texture: THREE.DataTexture | null;
  /** Excess paint per texel (paint-raster.ts RasterSurface). */
  excess: Uint16Array | null;
  /** Texel rects changed since the last upload (inclusive, paint-gpu.ts). */
  dirty: DirtyRect[];
}

export class PaintSystem {
  readonly surfaces: PaintSurface[] = [];
  private bySurfaceMesh = new Map<THREE.Object3D, PaintSurface>();
  private byKey = new Map<string, PaintSurface>();
  /** Flat faces by plane, so dots carry across seams onto coplanar neighbors. */
  private seams = new SeamIndex<PaintSurface>();
  /** Textures, uploads and their stats. */
  readonly gpu = new PaintGpu();
  /** While set, every stamp and roll that paints is appended as an op (paint-ops.ts). */
  log: PaintOp[] | null = null;
  /** Called when heavy paint on a vertical face should start a run (see paint-drips.ts). */
  onDrip: (s: PaintSurface, rect: Rect, x: number, y: number, rgb: Rgb) => void = () => {};
  private raster = new PaintRaster<PaintSurface>({
    touched: (s, x0, y0, x1, y1) => this.gpu.markDirty(s, x0, y0, x1, y1),
    drip: (s, rect, x, y, rgb) => this.onDrip(s, rect, x, y, rgb),
  });

  register(key: string, mesh: THREE.Mesh, material: SurfaceMaterial, geo: SurfaceGeometry): PaintSurface {
    const s: PaintSurface = { key, mesh, material, geo, data: null, mips: [], texture: null, excess: null, dirty: [] };
    this.surfaces.push(s);
    this.bySurfaceMesh.set(mesh, s);
    this.byKey.set(key, s);
    this.seams.add(s, geo.rects);
    mesh.userData.paintable = true;
    return s;
  }

  /** Forget a surface (prop deleted or rebuilt) and free its texture. Returns its paint data. */
  unregister(mesh: THREE.Object3D): Uint8Array | null {
    const s = this.bySurfaceMesh.get(mesh);
    if (!s) return null;
    this.bySurfaceMesh.delete(mesh);
    if (this.byKey.get(s.key) === s) this.byKey.delete(s.key);
    this.seams.remove(s);
    this.surfaces.splice(this.surfaces.indexOf(s), 1);
    this.gpu.dispose(s);
    return s.data;
  }

  /**
   * Give a rebuilt surface the paint of the one it replaces. Same faces, but the
   * atlas may differ (another paint detail): the paint is resampled face by face.
   */
  adopt(s: PaintSurface, from: Pick<PaintSurface, 'geo' | 'data'>) {
    if (!from.data) return;
    this.ensureTexture(s);
    resampleAtlas(from.geo, from.data, s.geo, s.data!);
    this.gpu.markDirty(s, 0, 0, s.geo.atlasW - 1, s.geo.atlasH - 1);
  }

  get(mesh: THREE.Object3D): PaintSurface | undefined {
    return this.bySurfaceMesh.get(mesh);
  }

  /** The live surface with this key (see PaintSurface.key); a rebuilt prop's new surface keeps the key. */
  find(key: string): PaintSurface | undefined {
    return this.byKey.get(key);
  }

  /** False once the surface was removed or rebuilt (paint still in flight to it is dropped). */
  private live(s: PaintSurface) {
    return this.bySurfaceMesh.get(s.mesh) === s;
  }

  /** CPU paint and its texture, on a surface's first hit. */
  private ensureTexture(s: PaintSurface) {
    if (s.texture) return;
    s.data = new Uint8Array(s.geo.atlasW * s.geo.atlasH * 4);
    this.gpu.create(s);
  }

  /**
   * Deposit paint at a point on a face (surfaces.ts facePoint).
   * `radius` in meters: texels whose centers lie within it get paint, so a dot
   * is the same size at every paint detail; one smaller than a texel paints
   * the texel under it. `amount` 0..1 opacity at the center, `color` sRGB 0..1,
   * `softness` 0 = hard dot .. 1 = fades to nothing at the rim.
   * `drip`: excess paint on opaque texels of vertical faces may start a run;
   * the number multiplies how often (DRIPS.perSquareMeter), 0 = never.
   * `square`: a hard square nib instead of a round dot (`radius` is half its
   * side), its sides along the face's axes, like a pump marker's nib.
   * `color` null scrubs paint off instead (the sponge): `amount` of the paint
   * left goes, so going over it again cleans it; unpainted surfaces are skipped.
   */
  stamp(
    s: PaintSurface,
    at: FacePoint,
    radius: number,
    amount: number,
    color: Rgb | null,
    softness = 0.5,
    drip = 0,
    square = false,
  ) {
    if (!this.live(s)) return;
    this.log?.push({ kind: 'stamp', key: s.key, rect: at.rect, u: at.u, v: at.v, radius, amount, color, softness, square });
    const rect = faceTexel(s, at);
    const { x: cx, y: cy } = atTexel;
    this.dot(s, rect, cx, cy, radius, amount, color, softness, drip, square);
    for (const n of this.pastEdge(rect, cx, cy, radius)) {
      if (!this.live(n.surface)) continue;
      worldToTexel(n.rect, seamPoint, seamTexel);
      this.dot(n.surface, n.rect, seamTexel.x, seamTexel.y, radius, amount, color, softness, drip, square);
    }
  }

  /**
   * Deposit a band of paint at a point on a face, like a paint roller pressed there:
   * `halfLength` along `axis` (a world direction, laid into the face's plane),
   * `halfWidth` across it, both in meters. The last `edge` fraction of each
   * end gets lighter, the way a roller's ends leave less paint. Faces with no
   * known plane (cylinders) take the band along their texture's u. Carries
   * across seams like stamp(); `drip` as in stamp().
   */
  roll(
    s: PaintSurface,
    at: FacePoint,
    axis: THREE.Vector3,
    halfLength: number,
    halfWidth: number,
    edge: number,
    amount: number,
    color: Rgb,
    drip = 0,
  ) {
    if (!this.live(s)) return;
    this.log?.push({ kind: 'roll', key: s.key, rect: at.rect, u: at.u, v: at.v, axis: axis.toArray(), halfLength, halfWidth, edge, amount, color });
    const rect = faceTexel(s, at);
    const { x: cx, y: cy } = atTexel;
    const band = { halfLength, halfWidth, edge, amount, color, drip };
    this.band(s, rect, cx, cy, axis, band);
    for (const n of this.pastEdge(rect, cx, cy, Math.hypot(halfLength, halfWidth))) {
      if (!this.live(n.surface)) continue;
      worldToTexel(n.rect, seamPoint, seamTexel);
      this.band(n.surface, n.rect, seamTexel.x, seamTexel.y, axis, band);
    }
  }

  /**
   * Coplanar faces next to `rect` that a stamp reaching `radius` m from texel
   * (cx, cy) spills onto past the face's edge (other props too); seamPoint is
   * then the stamp's center in the world.
   */
  private pastEdge(rect: Rect, cx: number, cy: number, radius: number): Iterable<SeamFace<PaintSurface>> {
    const r = radius * PAINT.texelsPerMeter;
    if (!rect.face || (cx - r >= rect.x && cx + r <= rect.x + rect.w && cy - r >= rect.y && cy + r <= rect.y + rect.h)) return NONE;
    texelToWorld(rect, cx, cy, seamPoint);
    return this.seams.near(rect, seamPoint, radius);
  }

  private band(s: PaintSurface, rect: Rect, cx: number, cy: number, axis: THREE.Vector3, b: Band) {
    this.ensureTexture(s);
    this.raster.band(s, rect, cx, cy, axis, b);
  }

  private dot(s: PaintSurface, rect: Rect, cx: number, cy: number, radius: number, amount: number, color: Rgb | null, softness: number, drip: number, square: boolean) {
    // Nothing to scrub off a surface that was never painted.
    if (!color && !s.data) return;
    this.ensureTexture(s);
    this.raster.dot(s, rect, cx, cy, radius, amount, color, softness, drip, square);
  }

  /** Paint a single texel (paint runs), clipped to its face rect. */
  dab(s: PaintSurface, rect: Rect, x: number, y: number, amount: number, color: Rgb) {
    if (x < rect.x || y < rect.y || x >= rect.x + rect.w || y >= rect.y + rect.h || !this.live(s)) return;
    this.ensureTexture(s);
    this.raster.texel(s, x, y, amount, color);
  }
}
