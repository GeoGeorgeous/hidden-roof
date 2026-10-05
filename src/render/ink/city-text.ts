import * as THREE from 'three';
import type { UvRect } from './glyphs';
import { JP_FAMILY, onJpFont } from './jp-font';
import { ENGLISH, JAPANESE as JAPANESE_TEXTS } from './slogans';

// Real slogans for the signs and billboards of the city (city/rooftops.ts), in
// the bundled Japanese font (jp-font.ts). One texture, drawn once, read by the
// city shader like the made-up glyph atlas it replaces there: no extra draw call
// and no per-pixel cost. (The sign props you place keep the made-up lettering.)
//
// Layout, in square cells of ROW px: every phrase is a strip of its own, ink on
// paper and paper on ink, centered in a full-width row (horizontal signs) and,
// for the Japanese ones, as a column of upright characters (vertical blade
// signs). A sign takes the strip's rect as wide as its shape: wider than the
// text leaves plain margins, narrower cuts it to a run of its characters.

const ROW = 40;
const W = 1024;
const INK = '#141416';
const PAPER = '#f2efe6';
/** Cells in a column strip (the longest Japanese phrase). */
const COL_CELLS = 13;

/** Japanese slogans (slogans.ts), one character per cell. */
const JAPANESE = JAPANESE_TEXTS.map((t) => Array.from(t));

/** English slogans: drawn in the same font, squeezed to LATIN_WIDTH cells per letter. */
const LATIN = ENGLISH;
const LATIN_WIDTH = 0.62;

interface Piece {
  chars: string[];
  /** Width in cells (= how wide a sign that shows it whole, without margins, is). */
  aspect: number;
  latin: boolean;
}

const PIECES: Piece[] = [
  ...JAPANESE.map((chars) => ({ chars, aspect: chars.length, latin: false })),
  ...LATIN.map((t) => ({ chars: [t], aspect: t.length * LATIN_WIDTH, latin: true })),
];
const N = PIECES.length;
const COLS = JAPANESE.length;
/** Rows (every piece, paper then ink) take the top of the atlas, the columns (every Japanese piece, paper then ink) the bottom. */
const COLUMNS_Y = 2 * N * ROW;
const H = COLUMNS_Y + COL_CELLS * ROW;
/** Characters that sit at the top right of their cell in vertical writing. */
const MARKS = '。、';

let atlas: THREE.CanvasTexture | null = null;

function draw(ctx: CanvasRenderingContext2D) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const variant of [0, 1]) {
    const bg = variant ? INK : PAPER;
    const fg = variant ? PAPER : INK;
    PIECES.forEach((p, i) => {
      const y = (variant * N + i) * ROW;
      ctx.fillStyle = bg;
      ctx.fillRect(0, y, W, ROW);
      ctx.fillStyle = fg;
      if (p.latin) {
        ctx.font = `900 ${ROW * 0.74}px ${JP_FAMILY}`;
        const sx = Math.min(1.4, Math.max(0.7, (p.aspect * ROW * 0.94) / Math.max(1, ctx.measureText(p.chars[0]).width)));
        ctx.save();
        ctx.translate(W / 2, y + ROW * 0.54);
        ctx.scale(sx, 1);
        ctx.fillText(p.chars[0], 0, 0);
        ctx.restore();
      } else {
        ctx.font = `900 ${ROW * 0.8}px ${JP_FAMILY}`;
        const x0 = W / 2 - (p.chars.length * ROW) / 2;
        p.chars.forEach((c, k) => ctx.fillText(c, x0 + (k + 0.5) * ROW, y + ROW * 0.54));
      }
    });
    JAPANESE.forEach((chars, j) => {
      const x = (variant * COLS + j) * ROW;
      ctx.fillStyle = bg;
      ctx.fillRect(x, COLUMNS_Y, ROW, COL_CELLS * ROW);
      ctx.fillStyle = fg;
      ctx.font = `900 ${ROW * 0.8}px ${JP_FAMILY}`;
      const top = COLUMNS_Y + ((COL_CELLS - chars.length) * ROW) / 2;
      chars.forEach((c, k) => {
        const mark = MARKS.includes(c);
        ctx.fillText(c, x + ROW / 2 + (mark ? ROW * 0.4 : 0), top + (k + 0.52) * ROW - (mark ? ROW * 0.45 : 0));
      });
    });
  }
}

/** The city's lettering atlas (see above); drawn at once, and again when the font arrives. */
export function cityTextAtlas() {
  if (atlas) return atlas;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  draw(ctx);
  atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  onJpFont(() => {
    draw(ctx);
    atlas!.needsUpdate = true;
  });
  return atlas;
}

/** [u0, v0, u1, v1] of a canvas rect (canvas rows run down, texture v runs up). */
const rect = (x0: number, y0: number, x1: number, y1: number): UvRect => [x0 / W, 1 - y1 / H, x1 / W, 1 - y0 / H];

/**
 * Lettering for a sign `aspect` (width / height) in shape: a phrase that fits
 * it, centered with margins, or, if none is short enough, a run of one. Japanese
 * only for `vertical` (a column of characters); `latin` prefers an English
 * slogan. `a` and `b` (0..1) pick which, so a sign's lettering follows from
 * two random draws, like the glyph atlas's signRect.
 */
export function cityTextRect(a: number, b: number, aspect: number, vertical: boolean, inverted: boolean, latin = false): UvRect {
  const variant = inverted ? 1 : 0;
  const all = PIECES.map((p, i) => ({ p, i }));
  const wantLatin = latin && !vertical;
  let fits = all.filter(({ p }) => p.latin === wantLatin && p.aspect <= aspect);
  if (!fits.length && wantLatin) fits = all.filter(({ p }) => !p.latin && p.aspect <= aspect);
  if (fits.length) {
    // Prefer the longer phrases that fit: a sign shows a whole sentence, with plain margins only if it must.
    const close = fits.filter(({ p }) => p.aspect >= aspect * 0.6);
    const pool = close.length ? close : fits;
    const { p, i } = pool[Math.floor(a * pool.length)];
    if (vertical) {
      const j = JAPANESE.indexOf(p.chars);
      const cells = Math.min(aspect, COL_CELLS);
      const mid = COLUMNS_Y + (COL_CELLS * ROW) / 2;
      const x = (variant * COLS + j) * ROW;
      return rect(x, mid - (cells * ROW) / 2, x + ROW, mid + (cells * ROW) / 2);
    }
    const y = (variant * N + i) * ROW;
    const half = (Math.min(aspect, W / ROW) * ROW) / 2;
    return rect(W / 2 - half, y, W / 2 + half, y + ROW);
  }
  // Nothing short enough: a run of characters from one Japanese phrase.
  const j = Math.floor(a * JAPANESE.length);
  const chars = JAPANESE[j];
  const count = Math.max(1, Math.min(chars.length, Math.round(aspect)));
  const start = Math.floor(b * (chars.length - count + 1));
  if (vertical) {
    const x = (variant * COLS + j) * ROW;
    const y0 = COLUMNS_Y + ((COL_CELLS - chars.length) * ROW) / 2 + start * ROW;
    return rect(x, y0, x + ROW, y0 + count * ROW);
  }
  const y = (variant * N + j) * ROW;
  const x0 = W / 2 - (chars.length * ROW) / 2 + start * ROW;
  return rect(x0, y, x0 + count * ROW, y + ROW);
}
