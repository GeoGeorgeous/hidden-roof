import * as THREE from 'three';
import { DRIPS } from './config';
import type { Rect, SurfaceGeometry } from './surfaces';
import type { SurfaceMaterial } from './materials';

// Paint lives in one RGBA texture per paintable surface (atlas of its faces).
// Textures are created on the first hit and uploaded only on frames they change.

export interface PaintSurface {
  mesh: THREE.Mesh;
  material: SurfaceMaterial;
  geo: SurfaceGeometry;
  data: Uint8Array | null;
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
    const s: PaintSurface = { mesh, material, geo, data: null, texture: null, excess: null, dirty: { x0: Infinity, y0: Infinity, x1: -1, y1: -1 } };
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
      this.textureBytes -= s.geo.atlasW * s.geo.atlasH * 4;
    }
    return s.data;
  }

  /** Give a new surface the paint of an old one with an identical atlas. */
  adopt(s: PaintSurface, data: Uint8Array) {
    if (data.length !== s.geo.atlasW * s.geo.atlasH * 4) return;
    this.ensureTexture(s);
    s.data!.set(data);
    s.texture!.needsUpdate = true;
  }

  get(mesh: THREE.Object3D): PaintSurface | undefined {
    return this.bySurfaceMesh.get(mesh);
  }

  private ensureTexture(s: PaintSurface) {
    if (s.texture) return;
    const { atlasW: w, atlasH: h } = s.geo;
    s.data = new Uint8Array(w * h * 4);
    const t = new THREE.DataTexture(s.data, w, h, THREE.RGBAFormat);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    s.texture = t;
    s.material.setPaint(t);
    this.textureCount++;
    this.textureBytes += w * h * 4;
  }

  /**
   * Deposit paint at a UV on a surface triangle.
   * `radius` in texels, `amount` 0..1 opacity at the center, `color` sRGB 0..1,
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
    this.ensureTexture(s);
    const { atlasW: w, rects, triToRect } = s.geo;
    const rect = rects[triToRect[faceIndex]];
    const data = s.data!;
    const cx = uv.x * s.geo.atlasW;
    const cy = uv.y * s.geo.atlasH;
    // Clip to the face rect plus its 1-texel padding so paint never bleeds onto another face.
    const x0 = Math.max(rect.x - 1, Math.floor(cx - radius));
    const x1 = Math.min(rect.x + rect.w, Math.floor(cx + radius));
    const y0 = Math.max(rect.y - 1, Math.floor(cy - radius));
    const y1 = Math.min(rect.y + rect.h, Math.floor(cy + radius));
    const drip = canDrip && DRIPS.enabled && rect.upright;
    const r2 = (radius + 0.5) * (radius + 0.5);
    let touched = false;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d2 = dx * dx + dy * dy;
        if (radius > 0 && d2 > r2) continue;
        const falloff = radius > 0 ? 1 - (d2 / r2) * softness : 1;
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
    if (x < rect.x || y < rect.y || x >= rect.x + rect.w || y >= rect.y + rect.h) return;
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
    if (Math.random() >= DRIPS.chance) return;
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

  /** Upload textures that changed this frame — only the rows/columns that changed. */
  flush() {
    this.uploadsLastFrame = this.dirty.size;
    this.uploadBytesLastFrame = 0;
    for (const s of this.dirty) {
      const t = s.texture!;
      const d = s.dirty;
      const w = s.geo.atlasW;
      const count = (d.x1 - d.x0 + 1) * 4;
      for (let y = d.y0; y <= d.y1; y++) t.addUpdateRange((y * w + d.x0) * 4, count);
      this.uploadBytesLastFrame += count * (d.y1 - d.y0 + 1);
      t.needsUpdate = true;
      d.x0 = d.y0 = Infinity;
      d.x1 = d.y1 = -1;
    }
    this.dirty.clear();
  }
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
