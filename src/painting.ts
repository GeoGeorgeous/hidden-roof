import * as THREE from 'three';
import { PAINT } from './config';
import type { SurfaceGeometry } from './surfaces';

// Paint lives in one RGBA texture per paintable surface (atlas of its faces).
// Textures are created on the first hit and uploaded only on frames they change.

export interface PaintSurface {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  geo: SurfaceGeometry;
  data: Uint8Array | null;
  texture: THREE.DataTexture | null;
  /** Dirty texel rect since the last upload (inclusive). */
  dirty: { x0: number; y0: number; x1: number; y1: number };
}

export class PaintSystem {
  readonly surfaces: PaintSurface[] = [];
  private bySurfaceMesh = new Map<THREE.Object3D, PaintSurface>();
  private dirty = new Set<PaintSurface>();
  private color = PAINT.color.map((c) => c / 255);
  textureCount = 0;
  textureBytes = 0;
  uploadsLastFrame = 0;
  uploadBytesLastFrame = 0;

  register(mesh: THREE.Mesh, material: THREE.ShaderMaterial, geo: SurfaceGeometry): PaintSurface {
    const s: PaintSurface = { mesh, material, geo, data: null, texture: null, dirty: { x0: Infinity, y0: Infinity, x1: -1, y1: -1 } };
    this.surfaces.push(s);
    this.bySurfaceMesh.set(mesh, s);
    mesh.userData.paintable = true;
    return s;
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
    s.material.uniforms.uPaint.value = t;
    this.textureCount++;
    this.textureBytes += w * h * 4;
  }

  /**
   * Deposit paint at a UV on a surface triangle.
   * `radius` in texels, `amount` 0..1 alpha added at the center.
   */
  stamp(s: PaintSurface, uv: THREE.Vector2, faceIndex: number, radius: number, amount: number) {
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
    const [cr, cg, cb] = this.color;
    const r2 = (radius + 0.5) * (radius + 0.5);
    let touched = false;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d2 = dx * dx + dy * dy;
        if (radius > 0 && d2 > r2) continue;
        const falloff = radius > 0 ? 1 - (d2 / r2) * 0.6 : 1;
        const amt = amount * falloff;
        const i = (y * w + x) * 4;
        const a = data[i + 3] / 255;
        const na = a + amt * (1 - a);
        if (na <= a) continue;
        // Paint "over": blend new color onto existing paint.
        const k = amt / na;
        data[i] = Math.round((data[i] / 255) * (1 - k) * 255 + cr * k * 255);
        data[i + 1] = Math.round((data[i + 1] / 255) * (1 - k) * 255 + cg * k * 255);
        data[i + 2] = Math.round((data[i + 2] / 255) * (1 - k) * 255 + cb * k * 255);
        data[i + 3] = Math.min(255, Math.ceil(na * 255));
        touched = true;
      }
    }
    if (!touched) return;
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
