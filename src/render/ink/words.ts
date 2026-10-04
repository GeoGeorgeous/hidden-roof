import * as THREE from 'three';
import type { UvRect } from './glyphs';

// Real words for small signs (exit, high voltage, name plates), unlike the
// made-up lettering of the big ones (glyphs.ts). Each sign's own text (typed
// in build mode, saved in the level) gets a 64 px row the first time it's
// used: ink on paper, or paper on ink. Drawn like sign lettering: straight
// from the texture, not lit (LETTERS in ink/tone.ts).

const W = 1024;
const ROW = 64;
const ROWS = 32;
const INK = '#141416';
const PAPER = '#f2efe6';
const SIZE = ROW * 0.72;
const font = (px: number) => `bold ${px}px Impact, 'Arial Narrow', sans-serif`;
/** Space around a word, in rows (fractions of its height). */
const PAD = 0.35;
/** Longest text a sign takes. */
export const MAX_TEXT = 24;

let atlas: THREE.CanvasTexture | null = null;
let ctx: CanvasRenderingContext2D;
/** Row and drawn width (px) of each text + inversion. */
const rows = new Map<string, { row: number; width: number }>();

export function wordAtlas() {
  if (atlas) return atlas;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = ROW * ROWS;
  ctx = canvas.getContext('2d')!;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  return atlas;
}

/** The row holding this text, drawn on first use. */
function rowOf(text: string, inverted: boolean) {
  const key = `${inverted ? 1 : 0}|${text}`;
  let r = rows.get(key);
  if (r) return r;
  wordAtlas();
  if (rows.size >= ROWS) console.warn(`sign text atlas full (${ROWS} texts): "${text}" overwrites the last row`);
  const row = Math.min(rows.size, ROWS - 1);
  ctx.fillStyle = inverted ? INK : PAPER;
  ctx.fillRect(0, row * ROW, W, ROW);
  // Long texts shrink to fit the row.
  ctx.font = font(SIZE);
  const px = Math.min(SIZE, (SIZE * (W - 2 * PAD * ROW)) / Math.max(1, ctx.measureText(text).width));
  ctx.font = font(px);
  ctx.fillStyle = inverted ? PAPER : INK;
  ctx.fillText(text, W / 2, row * ROW + ROW * 0.54);
  r = { row, width: ctx.measureText(text).width };
  rows.set(key, r);
  atlas!.needsUpdate = true;
  return r;
}

/**
 * Atlas rect of a sign's text, centered, `aspect` wide (width / height) or
 * wider if the text needs it. Returns the rect and the aspect it got: make the
 * sign face that shape so the text isn't stretched.
 */
export function wordRect(text: string, inverted: boolean, aspect: number): { rect: UvRect; aspect: number } {
  const { row, width } = rowOf(text.slice(0, MAX_TEXT), inverted);
  const a = Math.min(W / ROW, Math.max(aspect, width / ROW + 2 * PAD));
  const half = (a * ROW) / 2;
  // Canvas rows run down, texture v runs up.
  return { rect: [(W / 2 - half) / W, 1 - (row + 1) / ROWS, (W / 2 + half) / W, 1 - row / ROWS], aspect: a };
}
