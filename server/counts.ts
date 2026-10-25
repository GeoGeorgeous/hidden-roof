import { COLOR_ORDER, type PaintColor } from '../src/config';
import { rgbOf } from '../src/inventory/items';
import { opTool, type PaintOp } from '../src/paint-ops';
import type { Rgb } from '../src/painting';

// What the admin page counts (admin-api.ts): plain additions on paths that
// already run, never a pass of their own over the paint.

/** The next midnight UTC (ms) after `t`: the day's counts start again then. */
const midnight = (t = Date.now()) => (Math.floor(t / 864e5) + 1) * 864e5;

/** Bytes sent to games since the start (main.ts adds each frame), for the upload rate. */
export const traffic = { sent: 0 };

const nearest = new Map<number, PaintColor>();
/** The game color an op's color is (ops carry it rounded on the wire). */
function colorOf(c: Rgb): PaintColor {
  const key = (Math.round(c[0] * 255) << 16) | (Math.round(c[1] * 255) << 8) | Math.round(c[2] * 255);
  let best = nearest.get(key);
  if (best) return best;
  let far = Infinity;
  for (const name of COLOR_ORDER) {
    const g = rgbOf(name);
    const d = (g[0] - c[0]) ** 2 + (g[1] - c[1]) ** 2 + (g[2] - c[2]) ** 2;
    if (d < far) [far, best] = [d, name];
  }
  if (nearest.size < 4096) nearest.set(key, best!);
  return best!;
}

/** Stamps by tool (the sponge's are paint cleaned) and ops by color. */
export interface Paint {
  stamps: { can: number; marker: number; roller: number; sponge: number };
  colors: Partial<Record<PaintColor, number>>;
}

export const noPaint = (): Paint => ({ stamps: { can: 0, marker: 0, roller: 0, sponge: 0 }, colors: {} });

/** Ops a player painted, counted into each of `into` (a run is no one's stamp). */
export function countPaint(ops: readonly PaintOp[], into: Paint[]) {
  for (const op of ops) {
    const tool = opTool(op);
    const stamp = tool === 'can' || tool === 'marker' || tool === 'roller' || tool === 'sponge' ? tool : null;
    const c = op.kind !== 'drip' && op.color ? colorOf(op.color) : null;
    for (const p of into) {
      if (stamp) p.stamps[stamp]++;
      if (c) p.colors[c] = (p.colors[c] ?? 0) + 1;
    }
  }
}

/** A session's paint and most players at once, this UTC day. */
export class DayCounts {
  private until = midnight();
  private kept = noPaint();
  peak = { players: 0, at: new Date().toISOString() };

  /** Today's paint, to count into (countPaint). */
  get paint() {
    this.roll();
    return this.kept;
  }

  /** `n` players in it now. */
  players(n: number) {
    this.roll();
    if (n > this.peak.players) this.peak = { players: n, at: new Date().toISOString() };
  }

  /** The color painted most today, or null. */
  get topColor() {
    const { colors } = this.paint;
    let top: PaintColor | null = null;
    for (const c of COLOR_ORDER) if ((colors[c] ?? 0) > (top ? colors[top]! : 0)) top = c;
    return top;
  }

  private roll() {
    if (Date.now() < this.until) return;
    this.until = midnight();
    this.kept = noPaint();
    this.peak = { players: 0, at: new Date().toISOString() };
  }
}
