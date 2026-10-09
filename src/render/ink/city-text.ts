import type { UvRect } from './uv-rect';
import { JP_FAMILY, onJpFont } from './jp-font';
import { ENGLISH, JAPANESE } from './slogans';
import { canvasUv, INK, letteringTexture, PAPER } from './text-atlas';
import { fillColumn } from './vertical-text';

// Real slogans for the signs and billboards of the city (city/rooftops.ts), in
// the bundled Japanese font (jp-font.ts). One texture, drawn once, read by the
// city shader: no extra draw call and no per-pixel cost.
//
// Layout, in square cells of ROW px: every phrase is a strip of its own, ink on
// paper and paper on ink, centered in a full-width row (horizontal signs) and,
// for the Japanese ones, as a column of upright characters (vertical blade
// signs). A sign takes the strip's rect as wide as its shape: wider than the
// text leaves plain margins, narrower cuts it to a run of its characters.
// Under them a strip of plain ink: a sign's edges and back (CITY_PLAIN).

const ROW = 40;
/** English slogans: drawn in the same font, squeezed to LATIN_WIDTH cells per letter. */
const LATIN_WIDTH = 0.62;

interface Piece {
  chars: string[];
  /** Width in cells (= how wide a sign that shows it whole, without margins, is). */
  aspect: number;
  latin: boolean;
  /** Its strip among the rows, and (Japanese only, else -1) among the columns. */
  row: number;
  column: number;
}

/** Japanese slogans, one character per cell, then the English ones. */
const JP_PIECES: Piece[] = JAPANESE.map((t, i) => {
  const chars = Array.from(t);
  return { chars, aspect: chars.length, latin: false, row: i, column: i };
});
const PIECES: Piece[] = [...JP_PIECES, ...ENGLISH.map((t, i) => ({ chars: [t], aspect: t.length * LATIN_WIDTH, latin: true, row: JP_PIECES.length + i, column: -1 }))];
const N = PIECES.length;
const COLS = JP_PIECES.length;
/** Cells in a column strip: the longest Japanese phrase. */
const COL_CELLS = Math.max(...JP_PIECES.map((p) => p.chars.length));
/** Wide enough for every column strip, in both variants. */
const W = Math.max(1024, 2 * COLS * ROW);
/** Rows (every piece, paper then ink) take the top of the atlas, the columns (every Japanese piece, paper then ink) the bottom. */
const COLUMNS_Y = 2 * N * ROW;
const PLAIN_Y = COLUMNS_Y + COL_CELLS * ROW;
const H = PLAIN_Y + ROW;

let atlas: ReturnType<typeof letteringTexture> | null = null;

function draw(ctx: CanvasRenderingContext2D) {
  for (const variant of [0, 1]) {
    const bg = variant ? INK : PAPER;
    const fg = variant ? PAPER : INK;
    for (const p of PIECES) {
      const y = (variant * N + p.row) * ROW;
      ctx.fillStyle = bg;
      ctx.fillRect(0, y, W, ROW);
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
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
    }
    for (const p of JP_PIECES) {
      const x = (variant * COLS + p.column) * ROW;
      ctx.fillStyle = bg;
      ctx.fillRect(x, COLUMNS_Y, ROW, COL_CELLS * ROW);
      ctx.fillStyle = fg;
      ctx.font = `900 ${ROW * 0.8}px ${JP_FAMILY}`;
      fillColumn(ctx, p.chars, x + ROW / 2, COLUMNS_Y + ((COL_CELLS - p.chars.length) * ROW) / 2, ROW, ROW * 0.8);
    }
  }
  ctx.fillStyle = INK;
  ctx.fillRect(0, PLAIN_Y, W, ROW);
}

/** The city's lettering atlas (see above); drawn at once, and again when the font arrives. */
export function cityTextAtlas() {
  if (atlas) return atlas;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  draw(ctx);
  const t = (atlas = letteringTexture(canvas));
  onJpFont(() => {
    draw(ctx);
    t.needsUpdate = true;
  });
  return t;
}

const rect = (x0: number, y0: number, x1: number, y1: number): UvRect => canvasUv(x0, y0, x1, y1, W, H);

/** One point in the plain ink strip: a face mapped to it is plain ink. */
export const CITY_PLAIN = rect(W / 2, PLAIN_Y + ROW / 2, W / 2, PLAIN_Y + ROW / 2);

/**
 * Lettering for a sign `aspect` (width / height) in shape: a phrase that fits
 * it, centered with margins, or, if none is short enough, a run of one. Japanese
 * only for `vertical` (a column of characters); `latin` prefers an English
 * slogan. `a` and `b` (0..1) pick which, so a sign's lettering follows from
 * two random draws (the skyline layout depends on how many it takes).
 */
export function cityTextRect(a: number, b: number, aspect: number, vertical: boolean, inverted: boolean, latin = false): UvRect {
  const variant = inverted ? 1 : 0;
  const wantLatin = latin && !vertical;
  let fits = PIECES.filter((p) => p.latin === wantLatin && p.aspect <= aspect);
  if (!fits.length && wantLatin) fits = PIECES.filter((p) => !p.latin && p.aspect <= aspect);
  if (fits.length) {
    // Prefer the longer phrases that fit: a sign shows a whole sentence, with plain margins only if it must.
    const close = fits.filter((p) => p.aspect >= aspect * 0.6);
    const pool = close.length ? close : fits;
    const p = pool[Math.floor(a * pool.length)];
    if (vertical) {
      const cells = Math.min(aspect, COL_CELLS);
      const mid = COLUMNS_Y + (COL_CELLS * ROW) / 2;
      const x = (variant * COLS + p.column) * ROW;
      return rect(x, mid - (cells * ROW) / 2, x + ROW, mid + (cells * ROW) / 2);
    }
    const y = (variant * N + p.row) * ROW;
    const half = (Math.min(aspect, W / ROW) * ROW) / 2;
    return rect(W / 2 - half, y, W / 2 + half, y + ROW);
  }
  // Nothing short enough: a run of characters from one Japanese phrase.
  const p = JP_PIECES[Math.floor(a * JP_PIECES.length)];
  const chars = p.chars;
  const count = Math.max(1, Math.min(chars.length, Math.round(aspect)));
  const start = Math.floor(b * (chars.length - count + 1));
  if (vertical) {
    const x = (variant * COLS + p.column) * ROW;
    const y0 = COLUMNS_Y + ((COL_CELLS - chars.length) * ROW) / 2 + start * ROW;
    return rect(x, y0, x + ROW, y0 + count * ROW);
  }
  const y = (variant * N + p.row) * ROW;
  const x0 = W / 2 - (chars.length * ROW) / 2 + start * ROW;
  return rect(x0, y, x0 + count * ROW, y + ROW);
}
