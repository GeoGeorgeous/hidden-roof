import * as THREE from 'three';
import { onJpFont } from './jp-font';
import type { UvRect } from './uv-rect';

// One canvas texture of lettering cells, shared by the sign text modules
// (words.ts, panel-text.ts, neon-text.ts). Cells are packed in shelves and
// drawn on first use. A full atlas grows (twice as tall) instead of drawing
// over a cell in use. Growing changes every rect's UVs, and so does the sign
// font arriving after cells were measured with a fallback font (all atlases
// start over), so both bump `textAtlasVersion`: the level then rebuilds its
// lettered props (main.ts), which ask for their rects again.

export const INK = '#141416';
export const PAPER = '#f2efe6';

let version = 0;

/** Changes whenever a rect handed out earlier is no longer valid. */
export function textAtlasVersion() {
  return version;
}

/** [u0, v0, u1, v1] of a canvas rect in a `w` x `h` canvas (canvas rows run down, texture v runs up). */
export function canvasUv(x0: number, y0: number, x1: number, y1: number, w: number, h: number): UvRect {
  return [x0 / w, 1 - y1 / h, x1 / w, 1 - y0 / h];
}

/** A canvas texture with the settings every lettering atlas uses. */
export function letteringTexture(canvas: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export interface AtlasCell<T = void> {
  x: number;
  y: number;
  w: number;
  h: number;
  /** What `draw` returned for it (e.g. a measured width). */
  data: T;
}

interface Entry {
  cell: AtlasCell<unknown>;
  draw: (ctx: CanvasRenderingContext2D, cell: AtlasCell<unknown>) => unknown;
}

export class TextAtlas {
  readonly texture: THREE.CanvasTexture;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private cells = new Map<string, Entry>();
  private shelfY = 0;
  private shelfH = 0;
  private cursorX = 0;

  /** `width` x `height` texels to start with, filled with `background`. */
  constructor(
    readonly width: number,
    height: number,
    private background: string,
  ) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d')!;
    this.clear(0);
    this.texture = letteringTexture(this.canvas);
    onJpFont(() => {
      if (!this.cells.size) return;
      // Measured with a fallback font: start over, the props ask again.
      this.cells.clear();
      this.shelfY = this.shelfH = this.cursorX = 0;
      this.clear(0);
      this.texture.needsUpdate = true;
      version++;
    });
  }

  get height() {
    return this.canvas.height;
  }

  /**
   * The cell for `key`, `w` x `h` texels: allocated and drawn by `draw` on
   * first use (also again if the atlas grows, so `draw` must only depend on
   * its arguments).
   */
  cell<T>(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, cell: AtlasCell<T>) => T): AtlasCell<T> {
    const known = this.cells.get(key);
    if (known) return known.cell as AtlasCell<T>;
    w = Math.min(Math.ceil(w), this.width);
    h = Math.ceil(h);
    if (this.cursorX + w > this.width || h > this.shelfH) {
      // A new shelf (the current one is full, or too low for this cell).
      this.shelfY += this.shelfH;
      this.shelfH = h;
      this.cursorX = 0;
    }
    while (this.shelfY + h > this.canvas.height) this.grow();
    const cell: AtlasCell<T> = { x: this.cursorX, y: this.shelfY, w, h, data: undefined as T };
    this.cursorX += w;
    const entry: Entry = { cell, draw: draw as Entry['draw'] };
    this.cells.set(key, entry);
    this.paint(entry);
    this.texture.needsUpdate = true;
    return cell;
  }

  /** UVs of a canvas rect. */
  uv(x0: number, y0: number, x1: number, y1: number): UvRect {
    return canvasUv(x0, y0, x1, y1, this.width, this.canvas.height);
  }

  private paint(e: Entry) {
    this.ctx.save();
    e.cell.data = e.draw(this.ctx, e.cell);
    this.ctx.restore();
  }

  private clear(fromY: number) {
    this.ctx.fillStyle = this.background;
    this.ctx.fillRect(0, fromY, this.width, this.canvas.height - fromY);
  }

  /** Twice as tall: resizing wipes the canvas, so every cell is drawn again, and the GPU texture is made anew. */
  private grow() {
    this.canvas.height *= 2;
    this.clear(0);
    for (const e of this.cells.values()) this.paint(e);
    this.texture.dispose();
    this.texture.needsUpdate = true;
    version++;
  }
}
