import * as THREE from 'three';
import { DRIPS, PAINT } from './config';
import { mipRect, mipSizes, type MipSize } from './paint-mips';
import { resampleAtlas } from './paint-resample';
import type { Rect, SurfaceGeometry } from './surfaces';
import type { SurfaceMaterial } from './materials';

// Paint lives in one RGBA texture per paintable surface (atlas of its faces).
// Textures are created on the first hit and uploaded only on frames they change.

/**
 * Hands a surface's CPU paint to copyTextureToTexture, which uploads one
 * sub-rect of it in a single call. Never rendered: it must stay CPU-side.
 */
const uploadSource = new THREE.DataTexture(null, 1, 1);
const uploadRegion = new THREE.Box2();
const uploadAt = new THREE.Vector2();
/** Mip texels on their way to the GPU (paint-mips.ts). */
let scratch = new Uint8Array(0);

export interface PaintSurface {
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
  private dirty = new Set<PaintSurface>();
  textureCount = 0;
  textureBytes = 0;
  uploadsLastFrame = 0;
  uploadBytesLastFrame = 0;
  /** Called when heavy paint on a vertical face should start a run (see paint-drips.ts). */
  onDrip: (s: PaintSurface, rect: Rect, x: number, y: number, rgb: [number, number, number]) => void = () => {};

  register(mesh: THREE.Mesh, material: SurfaceMaterial, geo: SurfaceGeometry): PaintSurface {
    const s: PaintSurface = { mesh, material, geo, data: null, mips: [], texture: null, excess: null, dirty: { x0: Infinity, y0: Infinity, x1: -1, y1: -1 } };
    this.surfaces.push(s);
    this.bySurfaceMesh.set(mesh, s);
    mesh.userData.paintable = true;
    return s;
  }

  /** Forget a surface (prop deleted or rebuilt) and free its texture. Returns its paint data. */
  unregister(mesh: THREE.Object3D): Uint8Array | null {
    const s = this.bySurfaceMesh.get(mesh);
    if (!s) return null;
    this.bySurfaceMesh.delete(mesh);
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
   * Deposit paint at a UV on a surface triangle.
   * `radius` in meters: texels whose centers lie within it get paint, so a dot
   * is the same size at every paint detail; one smaller than a texel paints
   * the texel under it. `amount` 0..1 opacity at the center, `color` sRGB 0..1,
   * `softness` 0 = hard dot .. 1 = fades to nothing at the rim.
   * `canDrip`: excess paint on opaque texels of vertical faces may start a run.
   */
  stamp(
    s: PaintSurface,
    uv: { x: number; y: number },
    faceIndex: number,
    radius: number,
    amount: number,
    color: readonly [number, number, number],
    softness = 0.5,
    canDrip = false,
  ) {
    if (!this.live(s)) return;
    this.ensureTexture(s);
    const { atlasW: w, rects, triToRect } = s.geo;
    const rect = rects[triToRect[faceIndex]];
    const data = s.data!;
    const cx = uv.x * s.geo.atlasW;
    const cy = uv.y * s.geo.atlasH;
    const r = radius * PAINT.texelsPerMeter;
    // Under half a texel diagonal the dot could miss every texel center.
    const dot = r >= Math.SQRT1_2;
    const reach = dot ? r - 0.5 : 0;
    // Clip to the face rect plus its 1-texel padding so paint never bleeds onto another face.
    const x0 = Math.max(rect.x - 1, Math.floor(cx - reach));
    const x1 = Math.min(rect.x + rect.w, Math.floor(cx + reach));
    const y0 = Math.max(rect.y - 1, Math.floor(cy - reach));
    const y1 = Math.min(rect.y + rect.h, Math.floor(cy + reach));
    const drip = canDrip && DRIPS.enabled && rect.upright;
    const r2 = r * r;
    let touched = false;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d2 = dx * dx + dy * dy;
        if (dot && d2 > r2) continue;
        const falloff = dot ? 1 - (d2 / r2) * softness : 1;
        const amt = amount * falloff;
        if (amt <= 0) continue;
        const i = (y * w + x) * 4;
        if (drip && data[i + 3] >= 250) this.addExcess(s, rect, x, y, amt);
        blend(data, i, amt, color);
        touched = true;
      }
    }
    if (touched) this.markDirty(s, x0, y0, x1, y1);
  }

  /** Paint a single texel (paint runs), clipped to its face rect. */
  dab(s: PaintSurface, rect: Rect, x: number, y: number, amount: number, color: readonly [number, number, number]) {
    if (x < rect.x || y < rect.y || x >= rect.x + rect.w || y >= rect.y + rect.h || !this.live(s)) return;
    this.ensureTexture(s);
    blend(s.data!, (y * s.geo.atlasW + x) * 4, amount, color);
    this.markDirty(s, x, y, x, y);
  }

  private addExcess(s: PaintSurface, rect: Rect, x: number, y: number, amt: number) {
    const e = (s.excess ??= new Uint16Array(s.geo.atlasW * s.geo.atlasH));
    const k = y * s.geo.atlasW + x;
    const v = e[k] + Math.round(amt * 256);
    if (v < DRIPS.excess * 256) {
      e[k] = v;
      return;
    }
    e[k] = 0;
    if (Math.random() >= DRIPS.perSquareMeter / PAINT.texelsPerMeter ** 2) return;
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
function blend(data: Uint8Array, i: number, amt: number, color: readonly [number, number, number]) {
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
