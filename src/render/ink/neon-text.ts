import * as THREE from 'three';
import type { UvRect } from './glyphs';
import { JP_FAMILY, onJpFont } from './jp-font';

// Real vertical text for neon blade signs (kit/neon.ts), in a Japanese font
// that ships with the game (public/fonts/neon-jp.woff2: Noto Sans JP Black,
// SIL OFL, a subset: kana, ASCII and some kanji). The system may have no CJK
// font at all, so the page can't count on one. Each sign's text gets a tall
// cell, one character under another, in paper on ink; like the other lettering
// it is drawn straight from the texture (LETTERS in ink/tone.ts), and the
// sign's flicker dims it. Cells are drawn on first use, and again when the
// font arrives (it loads in the background).

const CELL_W = 128;
const CELL_H = 512;
const COLS = 8;
const ROWS = 4;
/** Empty texels left and right of the characters: the sign face inside its tubes is 0.54 m x 2.54 m, so its aspect is (CELL_W - 2 INSET) / CELL_H. */
const INSET = 10;
const INK = '#141416';
const PAPER = '#f2efe6';
/** Longest text a sign takes. */
export const NEON_MAX_TEXT = 12;
/** Marks that sit at the top right of their cell in vertical writing (in a horizontal font they sit at the bottom left). */
const MARKS = '。、．，';

let atlas: THREE.CanvasTexture | null = null;
let ctx: CanvasRenderingContext2D;
const cells = new Map<string, number>();

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
    for (const [text, i] of cells) draw(text, i);
    atlas!.needsUpdate = true;
  });
  return atlas;
}

function draw(text: string, i: number) {
  const x0 = (i % COLS) * CELL_W;
  const y0 = Math.floor(i / COLS) * CELL_H;
  ctx.fillStyle = INK;
  ctx.fillRect(x0, y0, CELL_W, CELL_H);
  const chars = Array.from(text);
  const face = CELL_W - 2 * INSET;
  // One character under another, as big as the sign's width or its height allows.
  const slot = Math.min(face, CELL_H / chars.length);
  const px = slot * 0.92;
  ctx.font = `900 ${px}px ${JP_FAMILY}`;
  ctx.fillStyle = PAPER;
  const top = y0 + (CELL_H - slot * chars.length) / 2;
  chars.forEach((c, k) => {
    const mark = MARKS.includes(c);
    ctx.fillText(c, x0 + CELL_W / 2 + (mark ? px * 0.5 : 0), top + slot * (k + 0.52) - (mark ? px * 0.6 : 0));
  });
}

/** Atlas rect of this text's cell (the sign face shows all of it); drawn on first use. */
export function neonRect(text: string): UvRect {
  const t = Array.from(text).slice(0, NEON_MAX_TEXT).join('');
  neonAtlas();
  let i = cells.get(t);
  if (i === undefined) {
    if (cells.size >= COLS * ROWS) console.warn(`neon text atlas full (${COLS * ROWS} texts): "${t}" overwrites the last cell`);
    i = Math.min(cells.size, COLS * ROWS - 1);
    cells.set(t, i);
    draw(t, i);
    atlas!.needsUpdate = true;
  }
  const W = CELL_W * COLS;
  const H = CELL_H * ROWS;
  const x = (i % COLS) * CELL_W;
  const y = Math.floor(i / COLS) * CELL_H;
  // Canvas rows run down, texture v runs up.
  return [(x + INSET) / W, 1 - (y + CELL_H) / H, (x + CELL_W - INSET) / W, 1 - y / H];
}
