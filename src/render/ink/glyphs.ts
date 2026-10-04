import * as THREE from 'three';
import { lcg } from '../../lcg';

// Sign lettering: an atlas of made-up glyphs, drawn once at startup. Most are
// CJK-like characters built from strokes on a 5 x 5 grid (bars, hooks, boxes,
// dots; whole, split left-right or top-bottom like radicals), the last rows
// condensed Latin capitals. The left half is ink on paper, the right half the
// same glyphs in paper on ink. A sign shows a run of cells: a row for
// horizontal lettering, a column for vertical (signRect). Filtered smoothly:
// the ink tone steps turn the soft edges back into crisp ones.

const CELLS = 16;
const PX = 64;
const SIZE = CELLS * PX;
/** Rows of CJK-like glyphs; the rest are Latin. */
const CJK_ROWS = 12;
const HALF = CELLS / 2;
const INK = '#141416';
const PAPER = '#f2efe6';

type Ctx = CanvasRenderingContext2D;

function strokes(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, rnd: () => number, n: number) {
  const gx = (i: number) => x0 + ((x1 - x0) * i) / 4;
  const gy = (i: number) => y0 + ((y1 - y0) * i) / 4;
  const pick = () => Math.floor(rnd() * 5);
  for (let k = 0; k < n; k++) {
    const kind = rnd();
    ctx.beginPath();
    if (kind < 0.32) {
      // Horizontal bar.
      const y = gy(pick());
      const a = Math.floor(rnd() * 2);
      ctx.moveTo(gx(a), y);
      ctx.lineTo(gx(4 - Math.floor(rnd() * 2)), y);
    } else if (kind < 0.55) {
      // Vertical bar, sometimes with a hook at the bottom.
      const x = gx(1 + Math.floor(rnd() * 3));
      const top = gy(Math.floor(rnd() * 2));
      const bot = gy(3 + Math.floor(rnd() * 2));
      ctx.moveTo(x, top);
      ctx.lineTo(x, bot);
      if (rnd() < 0.3) ctx.lineTo(x - (x1 - x0) * 0.12, bot - (y1 - y0) * 0.08);
    } else if (kind < 0.72) {
      // Box (mouth radical).
      const a = Math.floor(rnd() * 2);
      const b = 2 + Math.floor(rnd() * 3);
      const c = Math.floor(rnd() * 3);
      const d = c + 1 + Math.floor(rnd() * (4 - c));
      ctx.rect(gx(a), gy(c), gx(b) - gx(a), gy(d) - gy(c));
    } else if (kind < 0.88) {
      // Sweeping diagonal.
      const l = rnd() < 0.5;
      ctx.moveTo(gx(l ? 2 : 1), gy(1 + Math.floor(rnd() * 2)));
      ctx.quadraticCurveTo(gx(l ? 1 : 3), gy(3), gx(l ? 0 : 4), gy(4));
    } else {
      // Dot.
      const x = gx(pick());
      const y = gy(pick());
      ctx.moveTo(x, y);
      ctx.lineTo(x + (x1 - x0) * 0.08, y + (y1 - y0) * 0.1);
    }
    ctx.stroke();
  }
}

function cjk(ctx: Ctx, x: number, y: number, rnd: () => number) {
  const p = PX * 0.16;
  const [a, b, c, d] = [x + p, y + p, x + PX - p, y + PX - p];
  const layout = rnd();
  if (layout < 0.4) strokes(ctx, a, b, c, d, rnd, 4 + Math.floor(rnd() * 4));
  else if (layout < 0.8) {
    const m = a + (c - a) * (0.3 + rnd() * 0.15);
    strokes(ctx, a, b, m, d, rnd, 2 + Math.floor(rnd() * 2));
    strokes(ctx, m + 4, b, c, d, rnd, 3 + Math.floor(rnd() * 3));
  } else {
    const m = b + (d - b) * (0.35 + rnd() * 0.15);
    strokes(ctx, a, b, c, m, rnd, 2 + Math.floor(rnd() * 2));
    strokes(ctx, a, m + 4, c, d, rnd, 3 + Math.floor(rnd() * 3));
  }
}

function build() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const rnd = lcg(4242);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, SIZE / 2, SIZE);
  ctx.fillStyle = INK;
  ctx.fillRect(SIZE / 2, 0, SIZE / 2, SIZE);
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  const letters = 'ABCDEFGHKLMNOPRSTUVWXYZ';
  for (let r = 0; r < CELLS; r++) {
    for (let c = 0; c < HALF; c++) {
      // The same glyph in both halves: ink on paper, then paper on ink.
      const seed = Math.floor(rnd() * 1e9);
      for (const half of [0, 1]) {
        const x = (c + half * HALF) * PX;
        const y = r * PX;
        const color = half ? PAPER : INK;
        ctx.strokeStyle = ctx.fillStyle = color;
        ctx.lineWidth = PX * 0.085;
        if (r < CJK_ROWS) cjk(ctx, x, y, lcg(seed));
        else {
          ctx.font = `bold ${PX * 0.78}px Impact, 'Arial Narrow', sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(letters[seed % letters.length], x + PX / 2, y + PX * 0.54);
        }
      }
    }
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let atlas: THREE.Texture | null = null;
export function glyphAtlas() {
  return (atlas ??= build());
}

/** Atlas rect [u0, v0, u1, v1] of a sign's lettering. */
export type UvRect = [number, number, number, number];

/**
 * Lettering for a sign: `count` glyphs in a row (horizontal) or a column
 * (vertical), ink on paper or (inverted) paper on ink, Latin or not.
 * `rnd` picks which glyphs.
 */
export function signRect(rnd: () => number, count: number, vertical: boolean, inverted: boolean, latin = false): UvRect {
  const n = Math.max(1, Math.min(vertical ? CJK_ROWS : HALF, Math.round(count)));
  let c0: number;
  let r0: number;
  let cols: number;
  let rows: number;
  if (vertical) {
    c0 = Math.floor(rnd() * HALF);
    r0 = Math.floor(rnd() * (CJK_ROWS - n + 1));
    cols = 1;
    rows = n;
  } else {
    c0 = Math.floor(rnd() * (HALF - n + 1));
    r0 = latin ? CJK_ROWS + Math.floor(rnd() * (CELLS - CJK_ROWS)) : Math.floor(rnd() * CJK_ROWS);
    cols = n;
    rows = 1;
  }
  if (inverted) c0 += HALF;
  // Canvas rows run down, texture v runs up.
  return [c0 / CELLS, 1 - (r0 + rows) / CELLS, (c0 + cols) / CELLS, 1 - r0 / CELLS];
}
