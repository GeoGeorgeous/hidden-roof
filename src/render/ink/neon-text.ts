import * as THREE from 'three';
import type { UvRect } from './uv-rect';
import { JP_FAMILY, onJpFont } from './jp-font';

// Real vertical text for neon blade signs (kit/neon.ts), in a Japanese font
// that ships with the game (public/fonts/neon-jp.woff2: Noto Sans JP Black,
// SIL OFL, a subset: kana, ASCII and some kanji). The system may have no CJK
// font at all, so the page can't count on one. Each sign's text gets a tall
// cell, one character under another, in paper on ink; like the other lettering
// it is drawn straight from the texture (LETTERS in ink/tone.ts), and the
// sign's flicker dims it. Cells are drawn on first use, and again when the
// font arrives (it loads in the background).

const CELL_W = 192;
const CELL_H = 512;
const COLS = 5;
const ROWS = 4;
/** Width of the characters' column: the neon sign's face inside its tubes is 0.54 m x 2.54 m, so its aspect is FACE / CELL_H. A wider sign face (blade signs) just has margins. */
const FACE = 108;
export const NEON_FACE_ASPECT = FACE / CELL_H;
const INK = '#141416';
const PAPER = '#f2efe6';
/** Longest text a sign takes. */
export const NEON_MAX_TEXT = 12;
/** Marks that sit at the top right of their cell in vertical writing (in a horizontal font they sit at the bottom left). */
const MARKS = '。、．，';

let atlas: THREE.CanvasTexture | null = null;
let ctx: CanvasRenderingContext2D;
const cells = new Map<string, { i: number; text: string; inverted: boolean }>();

export function neonAtlas() {
  if (atlas) return atlas;
  const canvas = document.createElement('canvas');
  canvas.width = CELL_W * COLS;
  canvas.height = CELL_H * ROWS;
  ctx = canvas.getContext('2d')!;
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  onJpFont(() => {
    for (const { text, i, inverted } of cells.values()) draw(text, i, inverted);
    atlas!.needsUpdate = true;
  });
  return atlas;
}

function draw(text: string, i: number, inverted: boolean) {
  const x0 = (i % COLS) * CELL_W;
  const y0 = Math.floor(i / COLS) * CELL_H;
  ctx.fillStyle = inverted ? PAPER : INK;
  ctx.fillRect(x0, y0, CELL_W, CELL_H);
  const chars = Array.from(text);
  const face = FACE;
  // One character under another, as big as the sign's width or its height allows.
  const slot = Math.min(face, CELL_H / chars.length);
  const px = slot * 0.92;
  ctx.font = `900 ${px}px ${JP_FAMILY}`;
  ctx.fillStyle = inverted ? INK : PAPER;
  const top = y0 + (CELL_H - slot * chars.length) / 2;
  chars.forEach((c, k) => {
    const mark = MARKS.includes(c);
    ctx.fillText(c, x0 + CELL_W / 2 + (mark ? px * 0.5 : 0), top + slot * (k + 0.52) - (mark ? px * 0.6 : 0));
  });
}

/**
 * Atlas rect of this text's cell, drawn on first use: paper on ink, or (inverted)
 * ink on paper. The sign face shows all of it, `aspect` (width / height) wide:
 * the characters stay FACE texels across, so a wider face has margins.
 */
export function neonRect(text: string, inverted = false, aspect = NEON_FACE_ASPECT): UvRect {
  const t = Array.from(text).slice(0, NEON_MAX_TEXT).join('');
  const key = `${inverted ? 1 : 0}|${t}`;
  neonAtlas();
  let cell = cells.get(key);
  if (!cell) {
    if (cells.size >= COLS * ROWS) console.warn(`neon text atlas full (${COLS * ROWS} texts): "${t}" overwrites the last cell`);
    cell = { i: Math.min(cells.size, COLS * ROWS - 1), text: t, inverted };
    cells.set(key, cell);
    draw(t, cell.i, inverted);
    atlas!.needsUpdate = true;
  }
  const W = CELL_W * COLS;
  const H = CELL_H * ROWS;
  const x = (cell.i % COLS) * CELL_W;
  const y = Math.floor(cell.i / COLS) * CELL_H;
  const inset = (CELL_W - Math.min(CELL_W, aspect * CELL_H)) / 2;
  // Canvas rows run down, texture v runs up.
  return [(x + inset) / W, 1 - (y + CELL_H) / H, (x + CELL_W - inset) / W, 1 - y / H];
}
