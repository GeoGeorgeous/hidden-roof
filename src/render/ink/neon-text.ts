import type { UvRect } from './uv-rect';
import { JP_FAMILY } from './jp-font';
import { INK, PAPER, TextAtlas } from './text-atlas';
import { fillColumn } from './vertical-text';

// Real vertical text for neon blade signs (kit/neon.ts), in a Japanese font
// that ships with the game (public/fonts/neon-jp.woff2: Noto Sans JP Black,
// SIL OFL, a subset: kana, ASCII and some kanji). The system may have no CJK
// font at all, so the page can't count on one. Each sign's text gets a tall
// cell (text-atlas.ts), one character under another, in paper on ink; like
// the other lettering it is drawn straight from the texture (LETTERS in
// ink/tone.ts), and the sign's flicker dims it.

const CELL_W = 192;
const CELL_H = 512;
/** Width of the characters' column (texels of a CELL_H tall cell): a sign face wider than FACE / CELL_H just has margins. */
const FACE = 108;
/** Longest text a sign takes. */
export const NEON_MAX_TEXT = 12;

let atlas: TextAtlas | null = null;

export function neonAtlas() {
  return (atlas ??= new TextAtlas(CELL_W * 5, CELL_H * 4, INK)).texture;
}

/**
 * Atlas rect of this text's cell, drawn on first use: paper on ink, or (inverted)
 * ink on paper. The sign face shows all of it, `aspect` (width / height) wide:
 * the characters stay FACE texels across, so a wider face has margins.
 */
export function neonRect(text: string, inverted: boolean, aspect: number): UvRect {
  const t = Array.from(text).slice(0, NEON_MAX_TEXT).join('');
  neonAtlas();
  const a = atlas!;
  const c = a.cell(`${inverted ? 1 : 0}|${t}`, CELL_W, CELL_H, (ctx, { x, y }) => {
    ctx.fillStyle = inverted ? PAPER : INK;
    ctx.fillRect(x, y, CELL_W, CELL_H);
    const chars = Array.from(t);
    // One character under another, as big as the sign's width or its height allows.
    const slot = Math.min(FACE, CELL_H / chars.length);
    const px = slot * 0.92;
    ctx.font = `900 ${px}px ${JP_FAMILY}`;
    ctx.fillStyle = inverted ? INK : PAPER;
    fillColumn(ctx, chars, x + CELL_W / 2, y + (CELL_H - slot * chars.length) / 2, slot, px);
  });
  const inset = (CELL_W - Math.min(CELL_W, aspect * CELL_H)) / 2;
  return a.uv(c.x + inset, c.y, c.x + c.w - inset, c.y + c.h);
}
