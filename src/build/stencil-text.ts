import { HINT, type TagFont } from '../config';
import type { PaintImage } from '../paint-image';
import { FONT_FAMILIES, jpFontReady } from '../render/ink/jp-font';

// A hint as an image to paint (PaintSystem.imprint): one line of text in one
// of the pickup tags' fonts (graffiti, gothic: manga lettering, mono), where
// <k>KEY</k> is a key cap, e.g. "<k>RMB</k> Shake your can to release
// pressure". Drawn white on clear, with the font's overspray around the
// letters (HINT.looks); only alpha is kept.

/** A hint's pieces in order: text as written, and keys. */
function parseHint(text: string): { key: boolean; text: string }[] {
  const out: { key: boolean; text: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(/<k>(.*?)<\/k>/gi)) {
    if (m.index > last) out.push({ key: false, text: text.slice(last, m.index) });
    if (m[1].trim()) out.push({ key: true, text: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ key: false, text: text.slice(last) });
  // No room taken by spaces at either end.
  if (out.length && !out[0].key) out[0].text = out[0].text.trimStart();
  if (out.length && !out.at(-1)!.key) out.at(-1)!.text = out.at(-1)!.text.trimEnd();
  return out.filter((p) => p.text);
}

/** Each font's weight: the gothic is the neon signs' black, mono is bold to read as paint. */
const WEIGHT: Record<TagFont, number> = { mono: 700, gothic: 900, graffiti: 400 };
const css = (f: TagFont, px: number) => `${WEIGHT[f]} ${px}px ${FONT_FAMILIES[f]}`;

/** The fonts, loaded: hints drawn before would be in a fallback font. */
export const hintFontReady = () => Promise.all([document.fonts.load(css('graffiti', 32)), jpFontReady()]).then(() => undefined);

/** The hint in font `f`, `size` m per em, at `perMeter` pixels per meter; null when there's nothing to draw. */
export function hintImage(text: string, f: TagFont, size: number, perMeter: number): PaintImage | null {
  const pieces = parseHint(text);
  if (!pieces.length) return null;
  const look = HINT.looks[f];
  const em = size * perMeter;
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
  const label = (on: boolean) => css(f, (on ? HINT.keyLabel : 1) * em);
  const line = HINT.keyLine * em;
  const boxH = HINT.keyHeight * em;
  ctx.textBaseline = 'middle';
  // Each piece's width, and how far its letters reach above and below the middle (a key cap: its box).
  let up = boxH / 2 + line;
  let down = up;
  const widths = pieces.map((p) => {
    ctx.font = label(p.key);
    const m = ctx.measureText(p.text);
    up = Math.max(up, m.actualBoundingBoxAscent);
    down = Math.max(down, m.actualBoundingBoxDescent);
    return p.key ? m.width + 2 * HINT.keyPad * em + line + HINT.keyGap * em : m.width;
  });
  // Room around it for the overspray.
  const margin = Math.ceil(2 * look.overspray * em + line);
  const w = Math.ceil(widths.reduce((a, b) => a + b, 0)) + 2 * margin;
  const h = Math.ceil(up + down) + 2 * margin;
  // Resizing the canvas resets its state.
  ctx.canvas.width = w;
  ctx.canvas.height = h;
  ctx.fillStyle = ctx.strokeStyle = '#fff';
  ctx.shadowColor = `rgba(255, 255, 255, ${look.oversprayStrength})`;
  ctx.shadowBlur = look.overspray * em;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = line;
  const mid = margin + up;
  let x = margin;
  pieces.forEach((p, i) => {
    ctx.font = label(p.key);
    ctx.textAlign = p.key ? 'center' : 'left';
    if (!p.key) ctx.fillText(p.text, x, mid);
    else {
      const boxW = widths[i] - HINT.keyGap * em - line;
      ctx.beginPath();
      ctx.roundRect(x + line / 2, mid - boxH / 2, boxW, boxH, HINT.keyRound * em);
      ctx.stroke();
      ctx.fillText(p.text, x + line / 2 + boxW / 2, mid);
    }
    x += widths[i];
  });
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
  return { alpha, w, h, width: w / perMeter, height: h / perMeter, softness: look.softness };
}
