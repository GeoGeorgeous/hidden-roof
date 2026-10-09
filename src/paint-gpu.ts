import * as THREE from 'three';
import { PAINT } from './config';
import { mipRect, mipSizes, type MipSize } from './paint-mips';
import { PagePacker, type PageSlot } from './page-packer';
import type { PaintSurface } from './painting';

// Paint on the GPU: shared pages (PAINT.pageSize square, PAINT.mipLevels
// levels) hold the paint of many surfaces, each in its own block of its
// page (page-packer.ts), so the level draws many surfaces in one call
// (level/batches.ts). A page is made on the first hit on any of its surfaces
// and dropped when none of them holds paint. Each frame only what changed is
// uploaded: the dirty rects of each surface's atlas (a few per surface,
// PAINT.dirtyRects), then the same rects of each smaller level.

/** What unpainted surfaces sample: nothing. */
const NO_PAINT = new THREE.DataTexture(new Uint8Array(4), 1, 1);
NO_PAINT.needsUpdate = true;

export interface PaintPage {
  index: number;
  size: number;
  /** Made on the first hit on one of its surfaces. */
  texture: THREE.DataTexture | null;
  /** The texture the page's surfaces draw with (NO_PAINT while it has none): materials share this object. */
  uniform: { value: THREE.Texture };
  /** Its surfaces that hold paint. */
  painted: number;
  levels: MipSize[];
}

/**
 * Hands CPU texels to copyTextureToTexture, which uploads one sub-rect of them
 * in a single call. Never rendered: it must stay CPU-side.
 */
const uploadSource = new THREE.DataTexture(null, 1, 1);
const uploadRegion = new THREE.Box2();
const uploadAt = new THREE.Vector2();
/** Mip texels on their way to the GPU (paint-mips.ts), and zeros for blocks given back. */
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
  /** Pages with a texture, and their GPU memory. */
  textureCount = 0;
  textureBytes = 0;
  uploadsLastFrame = 0;
  uploadBytesLastFrame = 0;
  readonly pages = new PagePacker<PaintPage>(PAINT.pageSize, 2 ** (PAINT.mipLevels - 1), (index, size) => ({ index, size, texture: null, uniform: { value: NO_PAINT }, painted: 0, levels: mipSizes(size, size, PAINT.mipLevels) }));
  private dirty = new Set<PaintSurface>();
  /** Blocks given back while their page still holds other paint: zeroed on the next flush. */
  private clears: PageSlot<PaintPage>[] = [];

  /** A block on a page for a new surface; `group`: its level tile, whose surfaces share pages. */
  place(s: PaintSurface, group: string) {
    s.slot = this.pages.place(s.geo.atlasW, s.geo.atlasH, group);
  }

  /** Give a removed surface's block back (its paint goes first). */
  release(s: PaintSurface) {
    this.dispose(s);
    if (s.slot) this.pages.release(s.slot);
    s.slot = null;
  }

  /** Forget every page (a new level): their textures go too. */
  clear() {
    for (const p of this.pages.pages) this.drop(p);
    this.pages.clear();
    this.clears.length = 0;
  }

  /** A surface whose CPU paint was just created: its page gets a texture if it has none. */
  create(s: PaintSurface) {
    const page = s.slot!.page;
    s.mips = mipSizes(s.geo.atlasW, s.geo.atlasH, PAINT.mipLevels);
    if (!page.texture) {
      const t = new THREE.DataTexture(null, page.size, page.size, THREE.RGBAFormat);
      // Levels only tell three their sizes: it allocates them (zero-filled) without uploading; flush fills them.
      t.mipmaps = [{ data: null, width: page.size, height: page.size }, ...page.levels.map((m) => ({ data: null, ...m }))] as unknown as THREE.DataTexture['mipmaps'];
      t.magFilter = THREE.NearestFilter;
      // Nearest level too: blending levels would mix in the black of unpainted texels.
      t.minFilter = THREE.NearestMipmapNearestFilter;
      t.generateMipmaps = false;
      t.colorSpace = THREE.SRGBColorSpace;
      t.source.dataReady = false;
      t.needsUpdate = true;
      page.texture = t;
      page.uniform.value = t;
      this.textureCount++;
      this.textureBytes += pageBytes(page);
    }
    page.painted++;
    s.texture = page.texture;
  }

  /** A surface's paint is gone (cleaned off, or the surface removed): its block is zeroed, and its page dropped once no surface on it holds paint. */
  dispose(s: PaintSurface) {
    this.dirty.delete(s);
    if (!s.texture || !s.slot) return;
    s.texture = null;
    const page = s.slot.page;
    if (--page.painted === 0) this.drop(page);
    else this.clears.push(s.slot);
  }

  private drop(page: PaintPage) {
    if (!page.texture) return;
    page.texture.dispose();
    page.texture = null;
    page.uniform.value = NO_PAINT;
    page.painted = 0;
    this.textureCount--;
    this.textureBytes -= pageBytes(page);
    this.clears = this.clears.filter((c) => c.page !== page);
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
   * Upload what changed this frame: blocks given back are zeroed, then each
   * dirty rect in one call, then the same rect of each smaller level.
   */
  flush(renderer: THREE.WebGLRenderer) {
    this.uploadsLastFrame = 0;
    this.uploadBytesLastFrame = 0;
    for (const c of this.clears) this.zero(renderer, c);
    this.clears.length = 0;
    for (const s of this.dirty) {
      for (const r of s.dirty) this.upload(renderer, s, r);
      this.uploadsLastFrame += s.dirty.length;
      s.dirty.length = 0;
    }
    this.dirty.clear();
  }

  /** One dirty rect of a surface, atlas and smaller levels, into its block. Blocks start on whole texels of the smallest level. */
  private upload(renderer: THREE.WebGLRenderer, s: PaintSurface, r: DirtyRect) {
    const { atlasW: w, atlasH: h } = s.geo;
    const { x: bx, y: by } = s.slot!;
    let { x0, y0, x1, y1 } = r;
    uploadSource.image = { data: s.data, width: w, height: h };
    uploadRegion.min.set(x0, y0);
    uploadRegion.max.set(x1 + 1, y1 + 1);
    renderer.copyTextureToTexture(uploadSource, s.texture!, uploadRegion, uploadAt.set(bx + x0, by + y0));
    this.uploadBytesLastFrame += (x1 - x0 + 1) * (y1 - y0 + 1) * 4;
    s.mips.forEach((m, i) => {
      x0 = Math.min(x0 >> 1, m.width - 1);
      y0 = Math.min(y0 >> 1, m.height - 1);
      x1 = Math.min(x1 >> 1, m.width - 1);
      y1 = Math.min(y1 >> 1, m.height - 1);
      const rw = x1 - x0 + 1;
      const rh = y1 - y0 + 1;
      mipRect(s.data!, w, h, i + 1, x0, y0, x1, y1, room(rw * rh * 4));
      uploadSource.image = { data: scratch, width: rw, height: rh };
      renderer.copyTextureToTexture(uploadSource, s.texture!, null, uploadAt.set((bx >> (i + 1)) + x0, (by >> (i + 1)) + y0), 0, i + 1);
      this.uploadBytesLastFrame += rw * rh * 4;
    });
  }

  /** Zero a block given back, every level. */
  private zero(renderer: THREE.WebGLRenderer, c: PageSlot<PaintPage>) {
    const t = c.page.texture!;
    for (let k = 0; k <= c.page.levels.length; k++) {
      const w = Math.max(1, c.w >> k);
      const h = Math.max(1, c.h >> k);
      uploadSource.image = { data: room(w * h * 4).fill(0, 0, w * h * 4), width: w, height: h };
      renderer.copyTextureToTexture(uploadSource, t, null, uploadAt.set(c.x >> k, c.y >> k), 0, k);
    }
  }
}

/** The scratch buffer, at least `n` bytes. */
function room(n: number) {
  if (scratch.length < n) scratch = new Uint8Array(n);
  return scratch;
}

/** GPU memory of a page's texture, all levels. */
function pageBytes(p: PaintPage) {
  return p.levels.reduce((n, m) => n + m.width * m.height * 4, p.size * p.size * 4);
}
