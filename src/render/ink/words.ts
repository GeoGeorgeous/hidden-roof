import * as THREE from 'three';
import type { UvRect } from './glyphs';

// Real words for small signs (exit, high voltage, name plates), unlike the
// made-up lettering of the big ones (glyphs.ts). One word per 64 px row, ink on
// paper in the top half and the same words in paper on ink below. Drawn like
// sign lettering: straight from the texture, not lit (LETTERS in ink/tone.ts).

export const WORDS = ['EXIT', 'HIGH VOLTAGE', 'DANGER', 'ROOF ACCESS', 'STAFF ONLY', 'ELECTRICAL', 'KEEP CLEAR', 'PLANT ROOM', 'FIRE DOOR', 'NO ENTRY', 'MAINTENANCE'] as const;
export type Word = (typeof WORDS)[number];

const W = 1024;
const ROW = 64;
const ROWS = 32; // WORDS.length rows per half, room to add more
const INK = '#141416';
const PAPER = '#f2efe6';
const FONT = `bold ${ROW * 0.72}px Impact, 'Arial Narrow', sans-serif`;
/** Space around a word, in rows (fractions of its height). */
const PAD = 0.35;

let atlas: THREE.Texture | null = null;
/** Each word's width in pixels. */
const widths: number[] = [];

function build() {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = ROW * ROWS;
  const ctx = canvas.getContext('2d')!;
  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const half of [0, 1]) {
    ctx.fillStyle = half ? INK : PAPER;
    ctx.fillRect(0, half * (ROWS / 2) * ROW, W, (ROWS / 2) * ROW);
    ctx.fillStyle = half ? PAPER : INK;
    WORDS.forEach((w, i) => {
      widths[i] = ctx.measureText(w).width;
      ctx.fillText(w, W / 2, (half * (ROWS / 2) + i) * ROW + ROW * 0.54);
    });
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function wordAtlas() {
  return (atlas ??= build());
}

/**
 * Atlas rect of a word, centered, `aspect` wide (width / height) or wider if
 * the word needs it. Returns the rect and the aspect it got: make the sign
 * face that shape so the word isn't stretched.
 */
export function wordRect(word: Word, inverted: boolean, aspect: number): { rect: UvRect; aspect: number } {
  wordAtlas();
  const i = WORDS.indexOf(word);
  const a = Math.min(W / ROW, Math.max(aspect, widths[i] / ROW + 2 * PAD));
  const half = (a * ROW) / 2;
  const row = i + (inverted ? ROWS / 2 : 0);
  // Canvas rows run down, texture v runs up.
  return { rect: [(W / 2 - half) / W, 1 - (row + 1) / ROWS, (W / 2 + half) / W, 1 - row / ROWS], aspect: a };
}
