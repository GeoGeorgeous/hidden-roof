import * as THREE from 'three';
import { PAINT } from './config';
import { mipRect, mipSizes } from './paint-mips';
import type { PaintSurface } from './painting';

// Paint on the GPU: one texture per painted surface, created with its CPU paint
// on the first hit, and each frame an upload of only what changed: the dirty
// rect of the atlas, then the same rect of each smaller level.

/**
 * Hands a surface's CPU paint to copyTextureToTexture, which uploads one
 * sub-rect of it in a single call. Never rendered: it must stay CPU-side.
 */
const uploadSource = new THREE.DataTexture(null, 1, 1);
const uploadRegion = new THREE.Box2();
const uploadAt = new THREE.Vector2();
/** Mip texels on their way to the GPU (paint-mips.ts). */
let scratch = new Uint8Array(0);

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
