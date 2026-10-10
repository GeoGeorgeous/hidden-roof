import { HINT, type HintAlign, type HintFont } from '../config';
import type { PaintImage } from '../paint-image';
import { hintCss } from './hint-fonts';

// A hint as an image to paint (PaintSystem.imprint): text in one of the
// hint fonts (hint-fonts.ts; loaded before it's drawn), where
// <k>KEY</k> is a key cap and <br> starts a new line, e.g. "<k>RMB</k> Shake
// your can<br>to release pressure". Lines line up left, center or right.
// Drawn white on clear, with the font's overspray around the letters
// (HINT.looks); only alpha is kept.

/** The largest canvas a hint is drawn on: its side and its area (px), within every browser's. */
const MAX_SIDE = 16384;
const MAX_AREA = 1 << 25;

interface Piece {
  key: boolean;
  text: string;
}

/** A hint's lines, each its pieces in order: text as written, and keys. A line may be empty. */
function parseHint(text: string): Piece[][] {
  return text.split(/<br\s*\/?>/i).map(parseLine);
}

function parseLine(text: string): Piece[] {
  const out: Piece[] = [];
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

/** The hint in font `f`, `size` m per em, its lines lined up by `align`, at `perMeter` pixels per meter; null when there's nothing to draw. Throws, with a message for the status line, when it's too big to draw. */
export function hintImage(text: string, f: HintFont, size: number, perMeter: number, align: HintAlign = 'left'): PaintImage | null {
  const lines = parseHint(text);
  if (!lines.some((l) => l.length)) return null;
  const look = HINT.looks[f];
  const em = size * perMeter;
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
  const label = (on: boolean) => hintCss(f, (on ? HINT.keyLabel : 1) * em);
  const line = HINT.keyLine * em;
  const boxH = HINT.keyHeight * em;
  ctx.textBaseline = 'middle';
  const pitch = HINT.lineHeight * em;
  // Each piece's width, and how far letters reach above and below a line's middle (a key cap: its box).
  let up = boxH / 2 + line;
  let down = up;
  const widths = lines.map((pieces) =>
    pieces.map((p) => {
      ctx.font = label(p.key);
      const m = ctx.measureText(p.text);
      up = Math.max(up, m.actualBoundingBoxAscent);
      down = Math.max(down, m.actualBoundingBoxDescent);
      return p.key ? m.width + 2 * HINT.keyPad * em + line + HINT.keyGap * em : m.width;
    }),
  );
  // Room around it for the overspray.
  const margin = Math.ceil(2 * look.overspray * em + line);
  // Each line's width: a key cap ending one takes no gap after it.
  const lineW = widths.map((l, j) => l.reduce((a, b) => a + b, 0) - (lines[j].at(-1)?.key ? HINT.keyGap * em : 0));
  const textW = Math.max(...lineW);
  const w = Math.ceil(textW) + 2 * margin;
  const h = Math.ceil(up + down + (lines.length - 1) * pitch) + 2 * margin;
  // Browsers draw nothing on a canvas past these (or lose it).
  if (w > MAX_SIDE || h > MAX_SIDE || w * h > MAX_AREA) throw new Error('HINT TOO BIG: SHORTER LINES, OR [ FOR SMALLER');
  // Resizing the canvas resets its state.
  ctx.canvas.width = w;
  ctx.canvas.height = h;
  ctx.fillStyle = ctx.strokeStyle = '#fff';
  ctx.shadowColor = `rgba(255, 255, 255, ${look.oversprayStrength})`;
  ctx.shadowBlur = look.overspray * em;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = line;
  lines.forEach((pieces, j) => {
    const mid = margin + up + j * pitch;
    let x = margin + (textW - lineW[j]) * { left: 0, center: 0.5, right: 1 }[align];
    pieces.forEach((p, i) => {
      ctx.font = label(p.key);
      ctx.textAlign = p.key ? 'center' : 'left';
      if (!p.key) ctx.fillText(p.text, x, mid);
      else {
        const boxW = widths[j][i] - HINT.keyGap * em - line;
        ctx.beginPath();
        ctx.roundRect(x + line / 2, mid - boxH / 2, boxW, boxH, HINT.keyRound * em);
        ctx.stroke();
        ctx.fillText(p.text, x + line / 2 + boxW / 2, mid);
      }
      x += widths[j][i];
    });
  });
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
  return { alpha, w, h, width: w / perMeter, height: h / perMeter, softness: look.softness };
}
