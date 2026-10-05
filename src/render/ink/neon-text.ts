import type { UvRect } from './uv-rect';
import { JP_FAMILY } from './jp-font';
import { INK, PAPER, TextAtlas } from './text-atlas';

// Real vertical text for neon blade signs (kit/neon.ts), in a Japanese font
// that ships with the game (public/fonts/neon-jp.woff2: Noto Sans JP Black,
// SIL OFL, a subset: kana, ASCII and some kanji). The system may have no CJK
// font at all, so the page can't count on one. Each sign's text gets a tall
// cell (text-atlas.ts), one character under another, in paper on ink; like
// the other lettering it is drawn straight from the texture (LETTERS in
// ink/tone.ts), and the sign's flicker dims it.

const CELL_W = 192;
const CELL_H = 512;
/** Width of the characters' column: the neon sign's face inside its tubes is 0.54 m x 2.54 m, so its aspect is FACE / CELL_H. A wider sign face (blade signs) just has margins. */
const FACE = 108;
export const NEON_FACE_ASPECT = FACE / CELL_H;
/** Longest text a sign takes. */
export const NEON_MAX_TEXT = 12;
/** Marks that sit at the top right of their cell in vertical writing (in a horizontal font they sit at the bottom left). */
const MARKS = '。、．，';

let atlas: TextAtlas | null = null;

export function neonAtlas() {
  return (atlas ??= new TextAtlas(CELL_W * 5, CELL_H * 4, INK)).texture;
}

/**
 * Atlas rect of this text's cell, drawn on first use: paper on ink, or (inverted)
 * ink on paper. The sign face shows all of it, `aspect` (width / height) wide:
 * the characters stay FACE texels across, so a wider face has margins.
 */
export function neonRect(text: string, inverted = false, aspect = NEON_FACE_ASPECT): UvRect {
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
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const top = y + (CELL_H - slot * chars.length) / 2;
    chars.forEach((ch, k) => {
      const mark = MARKS.includes(ch);
      ctx.fillText(ch, x + CELL_W / 2 + (mark ? px * 0.5 : 0), top + slot * (k + 0.52) - (mark ? px * 0.6 : 0));
    });
  });
  const inset = (CELL_W - Math.min(CELL_W, aspect * CELL_H)) / 2;
  return a.uv(c.x + inset, c.y, c.x + c.w - inset, c.y + c.h);
}
