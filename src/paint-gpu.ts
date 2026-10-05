import * as THREE from 'three';
import { PAINT } from './config';
import { mipRect, mipSizes } from './paint-mips';
import type { PaintSurface } from './painting';

// Paint on the GPU: one texture per painted surface, created with its CPU paint
// on the first hit, and each frame an upload of only what changed: the dirty
// rects of the atlas (a few per surface, PAINT.dirtyRects), then the same rects
// of each smaller level.

/**
 * Hands a surface's CPU paint to copyTextureToTexture, which uploads one
 * sub-rect of it in a single call. Never rendered: it must stay CPU-side.
 */
const uploadSource = new THREE.DataTexture(null, 1, 1);
const uploadRegion = new THREE.Box2();
const uploadAt = new THREE.Vector2();
/** Mip texels on their way to the GPU (paint-mips.ts). */
let scratch = new Uint8Array(0);

/** Changed texels, inclusive. */
export interface DirtyRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Texels a rect gains by growing to take in another. */
function growth(r: DirtyRect, x0: number, y0: number, x1: number, y1: number) {
  return (Math.max(r.x1, x1) - Math.min(r.x0, x0) + 1) * (Math.max(r.y1, y1) - Math.min(r.y0, y0) + 1) - (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
}

export class PaintGpu {
  textureCount = 0;
  textureBytes = 0;
  uploadsLastFrame = 0;
  uploadBytesLastFrame = 0;
  private dirty = new Set<PaintSurface>();

  /** The texture for a surface whose CPU paint was just created. */
  create(s: PaintSurface) {
    const { atlasW: w, atlasH: h } = s.geo;
    const data = s.data!;
    s.mips = mipSizes(w, h, PAINT.mipLevels);
    const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    // Smaller levels only tell three their sizes: it allocates them, flush fills them.
    t.mipmaps = [{ data, width: w, height: h }, ...s.mips.map((m) => ({ data: new Uint8Array(0), ...m }))];
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

  /** Free a removed surface's texture. */
  dispose(s: PaintSurface) {
    this.dirty.delete(s);
    if (!s.texture) return;
    s.texture.dispose();
    this.textureCount--;
    this.textureBytes -= gpuBytes(s);
  }

  /** Texels in this rect (inclusive) changed: upload them on the next flush. */
  markDirty(s: PaintSurface, x0: number, y0: number, x1: number, y1: number) {
    this.dirty.add(s);
    const list = s.dirty;
    // Into a rect it touches; a new rect while there's room; else the one it grows least.
    let into: DirtyRect | undefined;
    for (const r of list) {
      if (x0 <= r.x1 + 1 && x1 >= r.x0 - 1 && y0 <= r.y1 + 1 && y1 >= r.y0 - 1) {
        into = r;
        break;
      }
    }
    if (!into && list.length < PAINT.dirtyRects) {
      list.push({ x0, y0, x1, y1 });
      return;
    }
    into ??= list.reduce((a, b) => (growth(b, x0, y0, x1, y1) < growth(a, x0, y0, x1, y1) ? b : a));
    into.x0 = Math.min(into.x0, x0);
    into.y0 = Math.min(into.y0, y0);
    into.x1 = Math.max(into.x1, x1);
    into.y1 = Math.max(into.y1, y1);
  }

  /**
   * Upload textures that changed this frame: each dirty rect in one call, then
   * the same rect of each smaller level, averaged from the atlas.
   */
  flush(renderer: THREE.WebGLRenderer) {
    this.uploadsLastFrame = 0;
    this.uploadBytesLastFrame = 0;
    for (const s of this.dirty) {
      for (const r of s.dirty) this.upload(renderer, s, r);
      this.uploadsLastFrame += s.dirty.length;
      s.dirty.length = 0;
    }
    this.dirty.clear();
  }

  /** One dirty rect of a surface, atlas and smaller levels. */
  private upload(renderer: THREE.WebGLRenderer, s: PaintSurface, r: DirtyRect) {
    const { atlasW: w, atlasH: h } = s.geo;
    let { x0, y0, x1, y1 } = r;
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
  }
}

/** GPU memory of a surface's paint texture, all levels. */
function gpuBytes(s: PaintSurface) {
  return s.mips.reduce((n, m) => n + m.width * m.height * 4, s.geo.atlasW * s.geo.atlasH * 4);
}
