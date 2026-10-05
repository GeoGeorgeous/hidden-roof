import * as THREE from 'three';
import { JP_FAMILY, onJpFont } from './jp-font';
import type { UvRect } from './uv-rect';

// Real text for the lettered panels of the wall sign, billboard and sign tower
// (kit/signs.ts panelLettering), in the bundled font (jp-font.ts). Each text gets
// a cell the shape of its panel, on one text row, packed in shelves: ink on
// paper or paper on ink, one line, as big as the panel's width or 60% of its
// height allows, centered. Drawn on first use, and again when the font arrives.
// Like all lettering it is drawn straight from the texture (LETTERS in ink/tone.ts).

const W = 1024;
const H = 1024;
/** Every cell is this tall (texels); its width follows the panel's aspect. */
const CELL_H = 128;
const INK = '#141416';
const PAPER = '#f2efe6';

interface Cell {
  text: string;
  inverted: boolean;
  x: number;
  y: number;
  w: number;
}

let atlas: THREE.CanvasTexture | null = null;
let ctx: CanvasRenderingContext2D;
const cells = new Map<string, Cell>();
let cursorX = 0;
let cursorY = 0;

export function panelAtlas() {
  if (atlas) return atlas;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  ctx = canvas.getContext('2d')!;
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  onJpFont(() => {
    for (const c of cells.values()) draw(c);
    atlas!.needsUpdate = true;
  });
  return atlas;
}

function draw({ text, inverted, x, y, w }: Cell) {
  ctx.fillStyle = inverted ? PAPER : INK;
  ctx.fillRect(x, y, w, CELL_H);
  ctx.fillStyle = inverted ? INK : PAPER;
  ctx.font = `900 ${CELL_H * 0.6}px ${JP_FAMILY}`;
  // As big as 60% of the panel's height, or smaller to fit 88% of its width.
  const fit = Math.min(1, (w * 0.88) / Math.max(1, ctx.measureText(text).width));
  ctx.font = `900 ${CELL_H * 0.6 * fit}px ${JP_FAMILY}`;
  ctx.fillText(text, x + w / 2, y + CELL_H * 0.54);
}

/**
 * Atlas rect of `text` on a panel `aspect` (width / height) in shape: ink on
 * paper, or (inverted) paper on ink. The panel shows all of it.
 */
export function panelRect(text: string, inverted: boolean, aspect: number): UvRect {
  panelAtlas();
  const w = Math.min(W, Math.max(CELL_H, Math.round(CELL_H * aspect)));
  const key = `${inverted ? 1 : 0}|${w}|${text}`;
  let cell = cells.get(key);
  if (!cell) {
    if (cursorX + w > W) {
      cursorX = 0;
      cursorY += CELL_H;
    }
    if (cursorY + CELL_H > H) {
      console.warn(`panel text atlas full: "${text}" overwrites the last row`);
      cursorY = H - CELL_H;
      cursorX = 0;
    }
    cell = { text, inverted, x: cursorX, y: cursorY, w };
    cursorX += w;
    cells.set(key, cell);
    draw(cell);
    atlas!.needsUpdate = true;
  }
  // Canvas rows run down, texture v runs up.
  return [cell.x / W, 1 - (cell.y + CELL_H) / H, (cell.x + cell.w) / W, 1 - cell.y / H];
}
