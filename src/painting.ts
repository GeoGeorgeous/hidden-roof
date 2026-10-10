import * as THREE from 'three';
import { PAINT } from './config';
import type { MipSize } from './paint-mips';
import { painted, resampleRect } from './paint-resample';
import type { FacePoint, Rect, SurfaceGeometry } from './surfaces';
import { SeamIndex, texelToWorld, worldToTexel, type SeamFace } from './paint-seams';
import { PaintGpu, type DirtyRect, type PaintPage } from './paint-gpu';
import type { PageSlot } from './page-packer';
import type { LightSlot } from './render/bake/light-pages';
import { inRing, PaintRaster, type Band, type Box } from './paint-raster';
import type { PaintOp } from './paint-ops';
import { imageOnFace, type PaintImage } from './paint-image';

// Paint lives in one RGBA atlas of its faces per paintable surface, on the
// CPU; on the GPU each surface has a block of a shared page (paint-gpu.ts).
// PaintSystem keeps the surfaces and turns stamps and rolls at face points into
// raster work (paint-raster.ts, CPU), carried across seams onto coplanar
// neighbors. Paint is created on the first hit and uploaded only on frames it
// changes.

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
  /** Never drawn (the level draws its surfaces merged, level/batches.ts): what tools' rays hit. */
  mesh: THREE.Mesh;
  geo: SurfaceGeometry;
  /** Its block on a paint page. */
  slot: PageSlot<PaintPage> | null;
  /** Its block on a light page (render/bake), once the baker took the surface in. */
  light: LightSlot | null;
  data: Uint8Array | null;
  /** Sizes of the texture's smaller levels for distant views (paint-mips.ts); empty until the first hit. */
  mips: MipSize[];
  /** Its page's texture, while it holds paint. */
  texture: THREE.DataTexture | null;
  /** Excess paint per texel (paint-raster.ts RasterSurface). */
  excess: Uint16Array | null;
  /** Texel rects changed since the last upload (inclusive, paint-gpu.ts). */
  dirty: DirtyRect[];
}

/** A box of a surface's paint (PaintSystem.patch): its texels and excess, or null where it had none. */
export interface PaintPatch {
  key: string;
  /** The surface's atlas size then: a rebuilt surface of another size can't take it. */
  atlas: [number, number];
  box: Box;
  data: Uint8Array | null;
  excess: Uint16Array | null;
}

export class PaintSystem {
  readonly surfaces: PaintSurface[] = [];
  private bySurfaceMesh = new Map<THREE.Object3D, PaintSurface>();
  private byKey = new Map<string, PaintSurface>();
  /** Flat faces by plane, so dots carry across seams onto coplanar neighbors. */
  private seams = new SeamIndex<PaintSurface>();
  /** Textures, uploads and their stats. */
  readonly gpu = new PaintGpu();
  /** Bumped when all paint is wiped (clear): paint still in flight from before it (spray particles) is dropped. */
  epoch = 0;
  /** While set, every stamp and roll that paints is appended as an op (paint-ops.ts). */
  log: PaintOp[] | null = null;
  /** Ops made so far (stamps, rolls, runs), logged or not: what saves and the network carry (F3). */
  opCount = 0;
  /** Called when heavy paint on a vertical face should start a run (see paint-drips.ts). */
  onDrip: (s: PaintSurface, rect: Rect, x: number, y: number, rgb: Rgb) => void = () => {};
  private raster = new PaintRaster<PaintSurface>({
    touched: (s, x0, y0, x1, y1) => this.gpu.markDirty(s, x0, y0, x1, y1),
    drip: (s, rect, x, y, rgb) => this.onDrip(s, rect, x, y, rgb),
  });

  /** `group`: where it stands (a level tile): surfaces drawn together share paint pages. */
  register(key: string, mesh: THREE.Mesh, geo: SurfaceGeometry, group: string): PaintSurface {
    const s: PaintSurface = { key, mesh, geo, slot: null, light: null, data: null, mips: [], texture: null, excess: null, dirty: [] };
    this.gpu.place(s, group);
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
    this.gpu.release(s);
    return s.data;
  }

  /**
   * A rebuilt prop's paint carries over face by face: a face of `fresh` takes
   * the paint of the face of `old` in the same place, resampled after a paint
   * detail change. A face that became covered (level/cover.ts) loses its paint;
   * one that was uncovered starts clean.
   */
  carry(old: readonly PaintSurface[], fresh: readonly PaintSurface[]) {
    const from = new Map<string, { s: PaintSurface; a: number }>();
    for (const s of old) if (s.data) s.geo.rects.forEach((r, a) => from.set(faceKey(s, r, a), { s, a }));
    if (!from.size) return;
    for (const s of fresh) {
      const faces = s.geo.rects.flatMap((r, b) => {
        const f = from.get(faceKey(s, r, b));
        return f ? [{ from: f.s, a: f.a, b }] : [];
      });
      if (faces.length) this.adopt(s, faces);
    }
  }

  /** Face `b` of `s` takes face `a` of `from`, resampled when the atlas differs. */
  private adopt(s: PaintSurface, faces: { from: PaintSurface; a: number; b: number }[]) {
    const live = faces.filter(({ from, a }) => from.data && painted(from.data, from.geo.atlasW, from.geo.rects[a]));
    if (!live.length) return;
    this.ensureTexture(s);
    for (const { from, a, b } of live) resampleRect(from.data!, from.geo.atlasW, from.geo.rects[a], s.data!, s.geo.atlasW, s.geo.rects[b]);
    this.gpu.markDirty(s, 0, 0, s.geo.atlasW - 1, s.geo.atlasH - 1);
  }

  /** Wipe all paint (LOAD replaces it), freeing it: textures are created again on the next hit. */
  clear() {
    this.epoch++;
    for (const s of this.surfaces) this.free(s);
  }

  /** Free a surface's paint if none is left (the sponge cleaned it all off): its memory comes back until the next hit. */
  freeIfClean(s: PaintSurface) {
    const d = s.data;
    if (!d || !this.live(s)) return;
    for (let i = 3; i < d.length; i += 4) if (d[i]) return;
    this.free(s);
  }

  private free(s: PaintSurface) {
    if (!s.data) return;
    this.gpu.dispose(s);
    s.data = s.excess = null;
    s.mips = [];
    s.dirty.length = 0;
  }

  /**
   * Paint face `rect` of a surface from a saved one (save/paint-file.ts): `w` x `h`
   * texels plus its 1-texel ring. Copied as is at the same size, else resampled
   * like a paint detail change.
   */
  putFace(s: PaintSurface, rect: number, crop: Uint8Array, w: number, h: number) {
    this.ensureTexture(s);
    const r = s.geo.rects[rect];
    const atlasW = s.geo.atlasW;
    if (w === r.w && h === r.h) {
      const row = (w + 2) * 4;
      for (let y = 0; y < h + 2; y++) s.data!.set(crop.subarray(y * row, (y + 1) * row), ((r.y - 1 + y) * atlasW + r.x - 1) * 4);
    } else resampleRect(crop, w + 2, { x: 1, y: 1, w, h }, s.data!, atlasW, r);
    this.gpu.markDirty(s, r.x - 1, r.y - 1, r.x + r.w, r.y + r.h);
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
   * the number is how often (runs per m² of paint reaching DRIPS.excess), 0 = never.
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
    this.opCount++;
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
    this.opCount++;
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

  /**
   * Paint an image onto a flat face, centered on a face point, its x along
   * world direction `right` and its y along `up` (unit vectors in the face's
   * plane): build mode's hints (build/paint-editor.ts). Each texel takes the
   * image's average over it. Carries across seams like stamp(); never logged,
   * since level paint is made in build mode, alone. `before` gets each surface
   * and the box it may paint, before it's painted (undo). False on a curved face.
   */
  imprint(s: PaintSurface, at: FacePoint, img: PaintImage, right: THREE.Vector3, up: THREE.Vector3, color: Rgb, before?: (s: PaintSurface, box: Box) => void) {
    const hit = faceTexel(s, at);
    if (!this.live(s) || !hit.face) return false;
    const center = texelToWorld(hit, atTexel.x, atTexel.y, new THREE.Vector3());
    for (const { surface, rect } of [{ surface: s, rect: hit }, ...this.seams.near(hit, center, Math.hypot(img.width, img.height) / 2)]) {
      if (!this.live(surface)) continue;
      const { box, alpha } = imageOnFace(img, rect, center, right, up);
      const on = inRing(rect, box);
      // A neighbor face the image doesn't reach.
      if (on[0] > on[2] || on[1] > on[3]) continue;
      before?.(surface, on);
      const fresh = !surface.data;
      this.ensureTexture(surface);
      // A neighbor the image only came near takes no paint, nor memory.
      if (!this.raster.image(surface, rect, box, alpha, color) && fresh) this.free(surface);
    }
    return true;
  }

  /** Face `rect` and its ring, as a box. */
  faceBox(s: PaintSurface, rect: number): Box {
    const r = s.geo.rects[rect];
    return [r.x - 1, r.y - 1, r.x + r.w, r.y + r.h];
  }

  /** Wipe one face's paint and its ring (build mode's X): the surface's memory comes back once none is left. */
  wipe(s: PaintSurface, rect: number) {
    if (s.data) this.unpatch({ key: s.key, atlas: [s.geo.atlasW, s.geo.atlasH], box: this.faceBox(s, rect), data: null, excess: null });
  }

  /** A box of a surface's paint as it is now, to put back with unpatch() (build mode's undo). */
  patch(s: PaintSurface, box: Box): PaintPatch {
    const w = s.geo.atlasW;
    const [x0, y0, x1, y1] = box;
    const crop = <T extends Uint8Array | Uint16Array>(src: T, n: number, out: T) => {
      for (let y = y0; y <= y1; y++) out.set(src.subarray((y * w + x0) * n, (y * w + x1 + 1) * n), (y - y0) * (x1 - x0 + 1) * n);
      return out;
    };
    const texels = (x1 - x0 + 1) * (y1 - y0 + 1);
    return { key: s.key, atlas: [w, s.geo.atlasH], box, data: s.data && crop(s.data, 4, new Uint8Array(texels * 4)), excess: s.excess && crop(s.excess, 1, new Uint16Array(texels)) };
  }

  /** Put a patch back (none in it: wipe its box), on the live surface with its key; false if it has none, or its atlas changed since. */
  unpatch({ key, atlas, box, data, excess }: PaintPatch) {
    const s = this.find(key);
    if (!s || s.geo.atlasW !== atlas[0] || s.geo.atlasH !== atlas[1]) return false;
    if (!data && !s.data) return true;
    this.ensureTexture(s);
    const w = atlas[0];
    const [x0, y0, x1, y1] = box;
    const bw = x1 - x0 + 1;
    for (let y = y0; y <= y1; y++) {
      const at = y * w + x0;
      const i = (y - y0) * bw;
      if (data) s.data!.set(data.subarray(i * 4, (i + bw) * 4), at * 4);
      else s.data!.fill(0, at * 4, (at + bw) * 4);
      if (excess) (s.excess ??= new Uint16Array(w * atlas[1])).set(excess.subarray(i, i + bw), at);
      else s.excess?.fill(0, at, at + bw);
    }
    this.gpu.markDirty(s, x0, y0, x1, y1);
    this.freeIfClean(s);
    return true;
  }

  /** Paint a single texel (paint runs), clipped to its face rect. */
  dab(s: PaintSurface, rect: Rect, x: number, y: number, amount: number, color: Rgb) {
    if (x < rect.x || y < rect.y || x >= rect.x + rect.w || y >= rect.y + rect.h || !this.live(s)) return;
    this.ensureTexture(s);
    this.raster.texel(s, x, y, amount, color);
  }
}

/** Where a face is, to match it across rebuilds: a flat face by its corners (to the mm), a curved one by its place in its surface. */
function faceKey(s: PaintSurface, r: Rect, i: number) {
  const f = r.face;
  if (!f) return `${s.key.slice(s.key.indexOf('#'))}:${i}`;
  return [f.origin, f.uAxis, f.vAxis].flatMap((v) => [v.x, v.y, v.z]).map((n) => Math.round(n * 1000)).join(',');
}
