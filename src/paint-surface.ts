import type * as THREE from 'three';
import type { PaintPage, DirtyRect } from './paint-gpu';
import type { MipSize } from './paint-mips';
import type { PageSlot } from './page-packer';
import type { Box } from './paint-raster';
import type { LightSlot } from './render/bake/light-pages';
import type { SurfaceGeometry } from './surfaces';

// A paint surface's data, as PaintSystem (painting.ts) and the modules it
// hands surfaces to (paint-gpu.ts, render/bake, level/batches.ts) share it.

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
