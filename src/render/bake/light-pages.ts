import * as THREE from 'three';
import { LIGHTMAP } from '../../config';
import { PagePacker, type PageSlot } from '../../page-packer';

// Baked light of the level's paintable surfaces on shared pages
// (LIGHTMAP.pageSize square, half float, linear light): each surface's light
// atlas (layout.ts) is a block of a page, so the level draws many surfaces
// with the same textures (level/batches.ts). A page keeps its texels on the
// CPU too: a bake writes a block there and only the block's rows are
// uploaded. Its neon flicker layer (alpha = the flicker slot) is made when a
// block of it first needs one. Blocks carry their own filled gutter
// (layout.ts), so linear filtering never reaches a neighbor.

export interface LightPage {
  index: number;
  size: number;
  light: THREE.DataTexture;
  flicker: THREE.DataTexture | null;
  /** What the page's surfaces draw with: materials share these objects. */
  uniforms: { light: { value: THREE.Texture }; flicker: { value: THREE.Texture }; flickerOn: { value: number } };
}

export type LightSlot = PageSlot<LightPage>;

/** What a page's surfaces sample before it has a flicker layer. */
const BLACK = new THREE.DataTexture(new Uint16Array(4), 1, 1, THREE.RGBAFormat, THREE.HalfFloatType);
BLACK.needsUpdate = true;

export class LightPages {
  private packer = new PagePacker<LightPage>(LIGHTMAP.pageSize, 1, (index, size) => {
    const light = layer(size);
    return { index, size, light, flicker: null, uniforms: { light: { value: light }, flicker: { value: BLACK }, flickerOn: { value: 0 } } };
  });

  /** `group`: the surface's level tile, whose surfaces share pages. */
  place(w: number, h: number, group: string): LightSlot {
    return this.packer.place(w, h, group);
  }

  /** Give a block back, dark. */
  release(slot: LightSlot) {
    this.write(slot, null, null);
    this.packer.release(slot);
  }

  /** Forget every page (a new level). */
  clear() {
    for (const p of this.packer.pages) {
      p.light.dispose();
      p.flicker?.dispose();
    }
    this.packer.clear();
  }

  /** A block's texels (`w` x `h` of its layout), light and flicker; null = dark, no flicker. */
  write(slot: LightSlot, light: Uint16Array | null, flicker: Uint16Array | null, w = slot.w, h = slot.h) {
    const page = slot.page;
    copyBlock(page.light, slot, light, w, h);
    if (flicker && !page.flicker) {
      page.flicker = layer(page.size);
      page.uniforms.flicker.value = page.flicker;
      page.uniforms.flickerOn.value = 1;
    }
    if (page.flicker) copyBlock(page.flicker, slot, flicker, w, h);
  }

  /** GPU memory of every page. */
  get bytes() {
    return this.packer.pages.reduce((n, p) => n + p.size * p.size * 8 * (p.flicker ? 2 : 1), 0);
  }
}

function layer(size: number) {
  const t = new THREE.DataTexture(new Uint16Array(size * size * 4), size, size, THREE.RGBAFormat, THREE.HalfFloatType);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Copy a block into a page row by row (zeros when `src` is null), and upload only those rows. */
function copyBlock(t: THREE.DataTexture, slot: LightSlot, src: Uint16Array | null, w: number, h: number) {
  const data = t.image.data as Uint16Array;
  const size = t.image.width;
  for (let y = 0; y < h; y++) {
    const at = ((slot.y + y) * size + slot.x) * 4;
    if (src) data.set(src.subarray(y * w * 4, (y + 1) * w * 4), at);
    else data.fill(0, at, at + w * 4);
    t.addUpdateRange(at, w * 4);
  }
  t.needsUpdate = true;
}
