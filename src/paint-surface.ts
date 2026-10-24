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

/**
 * A paint surface as everyone but its owners sees it. Each field is written by
 * one module, which gets it through `Owned` (painting.ts: data, wet;
 * paint-gpu.ts: slot, mips, and the rects in dirty; render/bake: light); the rest only read.
 */
export type PaintSurface = Readonly<PaintSurfaceFields>;

/** The fields a module writes on a surface it owns them on: `(s as Owned<'light'>).light = ...`. */
export type Owned<K extends keyof PaintSurfaceFields> = Pick<PaintSurfaceFields, K>;

interface PaintSurfaceFields {
  /** Stable name, the same on every client and at every paint detail: `p<prop id>#k` or `j<joint key>#k`, k = index in the prop's paint (level/build-prop.ts). */
  key: string;
  /** Never drawn (the level draws its surfaces merged, level/batches.ts): what tools' rays hit. */
  mesh: THREE.Mesh;
  geo: SurfaceGeometry;
  /** Its block on a paint page. */
  slot: PageSlot<PaintPage> | null;
  /** Its block on a light page (render/bake), once the baker took the surface in. */
  light: LightSlot | null;
  /** Its paint: RGBA texels of its atlas, there from the first hit until the paint is cleaned off or cleared. Ask hasPaint(), not data. */
  data: Uint8Array | null;
  /** Sizes of the texture's smaller levels for distant views (paint-mips.ts); empty while it has no paint. */
  mips: MipSize[];
  /** When each puddle cell's wet paint is dry (paint-raster.ts RasterSurface, wetCell). */
  wet: Float32Array | null;
  /** Texel rects changed since the last upload (inclusive, paint-gpu.ts: its list, nobody else's). */
  dirty: DirtyRect[];
}

/** Whether a surface holds paint: its CPU texels, and so a block of its page's texture, exist. The one answer to that (not "clean": freeIfClean scans for ink). */
export function hasPaint<S extends Pick<PaintSurface, 'data'>>(s: S): s is S & { readonly data: Uint8Array } {
  return s.data !== null;
}

/** A box of a surface's paint (PaintSystem.patch): its texels, or null where it had none (restored paint is dry). */
export interface PaintPatch {
  key: string;
  /** The surface's atlas size then: a rebuilt surface of another size can't take it. */
  atlas: [number, number];
  /** Its face rects then (x, y, w, h each): a rebuilt surface with other faces in the same atlas size can't take it either. */
  rects: number[];
  box: Box;
  data: Uint8Array | null;
}
