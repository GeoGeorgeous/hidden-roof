import * as THREE from 'three';
import { DRIPS, PAINT } from './config';
import { mipRect, mipSizes, type MipSize } from './paint-mips';
import { resampleAtlas } from './paint-resample';
import type { FacePoint, Rect, SurfaceGeometry } from './surfaces';
import type { SurfaceMaterial } from './materials';
import { SeamIndex, texelToWorld, worldToTexel, type SeamFace } from './paint-seams';
import { paintRandom } from './lcg';

// Paint lives in one RGBA texture per paintable surface (atlas of its faces).
// Textures are created on the first hit and uploaded only on frames they change.

/**
 * Hands a surface's CPU paint to copyTextureToTexture, which uploads one
 * sub-rect of it in a single call. Never rendered: it must stay CPU-side.
 */
const uploadSource = new THREE.DataTexture(null, 1, 1);
const uploadRegion = new THREE.Box2();
const uploadAt = new THREE.Vector2();
const seamPoint = new THREE.Vector3();
const seamTexel = new THREE.Vector2();
const NONE: readonly never[] = [];
/** A paint color: sRGB channels 0..1, the way paint textures store it (inventory/items.ts rgbOf). */
export type Rgb = readonly [number, number, number];
/** A roller band's size and paint (see PaintSystem.roll). */
interface Band {
  halfLength: number;
  halfWidth: number;
  edge: number;
  amount: number;
  color: Rgb;
  drip: number;
}
/** Mip texels on their way to the GPU (paint-mips.ts). */
let scratch = new Uint8Array(0);

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
  /** Excess paint per texel on already-opaque paint, in 1/256 coats (created on first excess). */
  excess: Uint16Array | null;
  /** Dirty texel rect since the last upload (inclusive). */
  dirty: { x0: number; y0: number; x1: number; y1: number };
}

export class PaintSystem {
  readonly surfaces: PaintSurface[] = [];
  private bySurfaceMesh = new Map<THREE.Object3D, PaintSurface>();
  private byKey = new Map<string, PaintSurface>();
  private dirty = new Set<PaintSurface>();
  /** Flat faces by plane, so dots carry across seams onto coplanar neighbors. */
  private seams = new SeamIndex<PaintSurface>();
  textureCount = 0;
  textureBytes = 0;
  uploadsLastFrame = 0;
  uploadBytesLastFrame = 0;
  /** Called when heavy paint on a vertical face should start a run (see paint-drips.ts). */
  onDrip: (s: PaintSurface, rect: Rect, x: number, y: number, rgb: Rgb) => void = () => {};

  register(key: string, mesh: THREE.Mesh, material: SurfaceMaterial, geo: SurfaceGeometry): PaintSurface {
    const s: PaintSurface = { key, mesh, material, geo, data: null, mips: [], texture: null, excess: null, dirty: { x0: Infinity, y0: Infinity, x1: -1, y1: -1 } };
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
    this.dirty.delete(s);
    if (s.texture) {
      s.texture.dispose();
      this.textureCount--;
      this.textureBytes -= gpuBytes(s);
    }
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
    this.markDirty(s, 0, 0, s.geo.atlasW - 1, s.geo.atlasH - 1);
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

  private ensureTexture(s: PaintSurface) {
    if (s.texture) return;
    const { atlasW: w, atlasH: h } = s.geo;
    s.data = new Uint8Array(w * h * 4);
    s.mips = mipSizes(w, h, PAINT.mipLevels);
    const t = new THREE.DataTexture(s.data, w, h, THREE.RGBAFormat);
    // Smaller levels only tell three their sizes: it allocates them, flush fills them.
    t.mipmaps = [{ data: s.data, width: w, height: h }, ...s.mips.map((m) => ({ data: new Uint8Array(0), ...m }))];
    t.magFilter = THREE.NearestFilter;
    // Nearest level too: blending levels would mix in the black of unpainted texels.
    t.minFilter = THREE.NearestMipmapNearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    // Allocate on the GPU (zero-filled) without uploading: flush uploads what gets painted.
    t.source.dataReady = false;
    t.needsUpdate = true;
    s.texture = t;
    s.material.setPaint(t);
    this.textureCount++;
    this.textureBytes += gpuBytes(s);
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
    const rect = s.geo.rects[at.rect];
    const cx = rect.x + at.u * rect.w;
    const cy = rect.y + at.v * rect.h;
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
    const rect = s.geo.rects[at.rect];
    const cx = rect.x + at.u * rect.w;
    const cy = rect.y + at.v * rect.h;
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

  /** One roller band centered at atlas texel coords (cx, cy), clipped to `rect` (see roll). */
  private band(s: PaintSurface, rect: Rect, cx: number, cy: number, axis: THREE.Vector3, b: Band) {
    this.ensureTexture(s);
    // The axis in texels: texel x runs along the face's u, y along its v, at the same density.
    let ax = 1;
    let ay = 0;
    if (rect.face) {
      const u = axis.dot(rect.face.uAxis) / rect.face.uAxis.length();
      const v = axis.dot(rect.face.vAxis) / rect.face.vAxis.length();
      const len = Math.hypot(u, v);
      if (len > 1e-3) [ax, ay] = [u / len, v / len];
    }
    const w = s.geo.atlasW;
    const data = s.data!;
    const L = Math.max(0.5, b.halfLength * PAINT.texelsPerMeter);
    const T = Math.max(0.5, b.halfWidth * PAINT.texelsPerMeter);
    const fade = b.edge * L;
    const ex = Math.abs(ax) * L + Math.abs(ay) * T;
    const ey = Math.abs(ay) * L + Math.abs(ax) * T;
    // Clip to the face rect plus its 1-texel padding so paint never bleeds onto another face.
    const x0 = Math.max(rect.x - 1, Math.floor(cx - ex));
    const x1 = Math.min(rect.x + rect.w, Math.floor(cx + ex));
    const y0 = Math.max(rect.y - 1, Math.floor(cy - ey));
    const y1 = Math.min(rect.y + rect.h, Math.floor(cy + ey));
    const runs = DRIPS.enabled && rect.upright ? b.drip : 0;
    let touched = false;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const along = Math.abs(dx * ax + dy * ay);
        if (along > L || Math.abs(dy * ax - dx * ay) > T) continue;
        const amt = fade > 0 ? b.amount * Math.min(1, (L - along) / fade) : b.amount;
        if (amt <= 0) continue;
        const i = (y * w + x) * 4;
        if (runs && data[i + 3] >= 250) this.addExcess(s, rect, x, y, amt, runs);
        blend(data, i, amt, b.color);
        touched = true;
      }
    }
    if (touched) this.markDirty(s, x0, y0, x1, y1);
  }

  /** One dot centered at atlas texel coords (cx, cy), clipped to `rect` (see stamp). */
  private dot(
    s: PaintSurface,
    rect: Rect,
    cx: number,
    cy: number,
    radius: number,
    amount: number,
    color: Rgb | null,
    softness: number,
    drip: number,
    square: boolean,
  ) {
    // Nothing to scrub off a surface that was never painted.
    if (!color && !s.data) return;
    this.ensureTexture(s);
    const w = s.geo.atlasW;
    const data = s.data!;
    const r = radius * PAINT.texelsPerMeter;
    // Under half a texel diagonal the dot could miss every texel center.
    const dot = r >= Math.SQRT1_2;
    const reach = dot ? r - 0.5 : 0;
    // Clip to the face rect plus its 1-texel padding so paint never bleeds onto another face.
    const x0 = Math.max(rect.x - 1, Math.floor(cx - reach));
    const x1 = Math.min(rect.x + rect.w, Math.floor(cx + reach));
    const y0 = Math.max(rect.y - 1, Math.floor(cy - reach));
    const y1 = Math.min(rect.y + rect.h, Math.floor(cy + reach));
    const runs = DRIPS.enabled && rect.upright ? drip : 0;
    const r2 = r * r;
    let touched = false;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d2 = dx * dx + dy * dy;
        if (dot && (square ? Math.abs(dx) > r || Math.abs(dy) > r : d2 > r2)) continue;
        const falloff = dot && !square ? 1 - (d2 / r2) * softness : 1;
        const amt = amount * falloff;
        if (amt <= 0) continue;
        const i = (y * w + x) * 4;
        if (!color) {
          if (data[i + 3] === 0) continue;
          data[i + 3] = toward(data[i + 3], 0, amt);
          touched = true;
          continue;
        }
        if (runs && data[i + 3] >= 250) this.addExcess(s, rect, x, y, amt, runs);
        blend(data, i, amt, color);
        touched = true;
      }
    }
    if (touched) this.markDirty(s, x0, y0, x1, y1);
  }

  /** Paint a single texel (paint runs), clipped to its face rect. */
  dab(s: PaintSurface, rect: Rect, x: number, y: number, amount: number, color: Rgb) {
    if (x < rect.x || y < rect.y || x >= rect.x + rect.w || y >= rect.y + rect.h || !this.live(s)) return;
    this.ensureTexture(s);
    blend(s.data!, (y * s.geo.atlasW + x) * 4, amount, color);
    this.markDirty(s, x, y, x, y);
  }

  private addExcess(s: PaintSurface, rect: Rect, x: number, y: number, amt: number, rate: number) {
    const e = (s.excess ??= new Uint16Array(s.geo.atlasW * s.geo.atlasH));
    const k = y * s.geo.atlasW + x;
    const v = e[k] + Math.round(amt * 256);
    if (v < DRIPS.excess * 256) {
      e[k] = v;
      return;
    }
    e[k] = 0;
    if (paintRandom() >= (DRIPS.perSquareMeter * rate) / PAINT.texelsPerMeter ** 2) return;
    const i = k * 4;
    const d = s.data!;
    this.onDrip(s, rect, x, y, [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255]);
  }

  private markDirty(s: PaintSurface, x0: number, y0: number, x1: number, y1: number) {
    const d = s.dirty;
    d.x0 = Math.min(d.x0, x0);
    d.y0 = Math.min(d.y0, y0);
    d.x1 = Math.max(d.x1, x1);
    d.y1 = Math.max(d.y1, y1);
    this.dirty.add(s);
  }

  /**
   * Upload textures that changed this frame: only the rect that changed, in one
   * call, then the same rect of each smaller level, averaged from the atlas.
   */
  flush(renderer: THREE.WebGLRenderer) {
    this.uploadsLastFrame = this.dirty.size;
    this.uploadBytesLastFrame = 0;
    for (const s of this.dirty) {
      const { atlasW: w, atlasH: h } = s.geo;
      let { x0, y0, x1, y1 } = s.dirty;
      uploadSource.image = { data: s.data, width: w, height: h };
      uploadRegion.min.set(x0, y0);
      uploadRegion.max.set(x1 + 1, y1 + 1);
      renderer.copyTextureToTexture(uploadSource, s.texture!, uploadRegion, uploadAt.set(x0, y0));
      this.uploadBytesLastFrame += (x1 - x0 + 1) * (y1 - y0 + 1) * 4;
      s.mips.forEach((m, i) => {
        x0 = Math.min(x0 >> 1, m.width - 1);
        y0 = Math.min(y0 >> 1, m.height - 1);
        x1 = Math.min(x1 >> 1, m.width - 1);
        y1 = Math.min(y1 >> 1, m.height - 1);
        const rw = x1 - x0 + 1;
        const rh = y1 - y0 + 1;
        if (scratch.length < rw * rh * 4) scratch = new Uint8Array(rw * rh * 4);
        mipRect(s.data!, w, h, i + 1, x0, y0, x1, y1, scratch);
        uploadSource.image = { data: scratch, width: rw, height: rh };
        renderer.copyTextureToTexture(uploadSource, s.texture!, null, uploadAt.set(x0, y0), 0, i + 1);
        this.uploadBytesLastFrame += rw * rh * 4;
      });
      s.dirty.x0 = s.dirty.y0 = Infinity;
      s.dirty.x1 = s.dirty.y1 = -1;
    }
    this.dirty.clear();
  }
}

/** GPU memory of a surface's paint texture, all levels. */
function gpuBytes(s: PaintSurface) {
  return s.mips.reduce((n, m) => n + m.width * m.height * 4, s.geo.atlasW * s.geo.atlasH * 4);
}

/**
 * One paint layer, new paint composited OVER it: the color always moves toward
 * the new paint by its own amount, even where the layer is already opaque.
 * (Alpha and color are independent: a full-alpha texel still takes new color.)
 */
function blend(data: Uint8Array, i: number, amt: number, color: Rgb) {
  const a = data[i + 3] / 255;
  const na = amt + a * (1 - amt);
  const k = amt / na;
  data[i] = toward(data[i], color[0] * 255, k);
  data[i + 1] = toward(data[i + 1], color[1] * 255, k);
  data[i + 2] = toward(data[i + 2], color[2] * 255, k);
  data[i + 3] = toward(data[i + 3], 255, amt);
}

/**
 * Move an 8-bit channel toward `target` by fraction k, always by at least one
 * step, so repeated light coats converge on the new color instead of stalling
 * a few values short because of rounding.
 */
function toward(cur: number, target: number, k: number) {
  const t = Math.round(target);
  if (cur === t) return cur;
  const next = Math.round(cur + (t - cur) * k);
  return t > cur ? Math.min(t, Math.max(cur + 1, next)) : Math.max(t, Math.min(cur - 1, next));
}
