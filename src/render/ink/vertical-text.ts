// Vertical writing for the column signs (neon-text.ts, city-text.ts): one
// character under another, centered on a column.

/** Marks that sit at the top right of their cell in vertical writing (in a horizontal font they sit at the bottom left). */
const MARKS = '。、．，';

/**
 * Fill `chars` down a column centered on `cx`, starting at `top`, one per
 * `slot` px, in a font `px` high (already set on `ctx`).
 */
export function fillColumn(ctx: CanvasRenderingContext2D, chars: readonly string[], cx: number, top: number, slot: number, px: number) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  chars.forEach((ch, k) => {
    const mark = MARKS.includes(ch);
    ctx.fillText(ch, cx + (mark ? px * 0.5 : 0), top + slot * (k + 0.52) - (mark ? px * 0.6 : 0));
  });
}
