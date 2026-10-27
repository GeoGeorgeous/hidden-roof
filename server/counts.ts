import { COLOR_ORDER, SERVER, type PaintColor } from '../src/config';
import { rgbOf } from '../src/inventory/items';
import { opTool, type PaintOp } from '../src/paint-ops';
import type { Rgb } from '../src/painting';

// What the admin page counts (admin-api.ts): plain additions on paths that
// already run, never a pass of their own over the paint.

/** The next midnight UTC (ms) after `t`: the day's counts start again then. */
const midnight = (t = Date.now()) => (Math.floor(t / 864e5) + 1) * 864e5;

/** The median of `sorted` (ascending): the middle one, or the mean of the two in the middle; null for none. */
export const median = (sorted: number[]) => (sorted.length ? (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2 : null);

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
    this.peak = raised(this.peak, n)!;
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

/** How a session's paint began. */
export type Began = 'made' | 'wiped' | 'restored';

/** What `SessionStats.toJSON` writes beside a save (kept.ts). */
export interface StoredStats {
  since: number;
  began: Began;
  restoredAt: number | null;
  stamps: Paint['stamps'];
  colors: Paint['colors'];
  painters: string[];
  played: number;
  joins: number;
  peak: { players: number; at: string } | null;
}

/** `peak` or `n` players now, whichever is more. */
export const raised = (peak: { players: number; at: string } | null, n: number) => (n > (peak?.players ?? 0) ? { players: n, at: new Date().toISOString() } : peak);

const isCount = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/**
 * A session's counts since its paint began (made, wiped or restored), counted
 * where the day's are: the admin page's `stats`. Each save has them beside it on
 * disk (kept.ts); a wipe zeroes them and a restore brings the save's back.
 */
export class SessionStats {
  /** Stamps by tool and ops by color (countPaint). */
  readonly paint = noPaint();
  private names = new Set<string>();
  /** Player-seconds of players gone, from when the paint began. */
  private played = 0;
  joins = 0;
  peak: { players: number; at: string } | null = null;
  restoredAt: number | null = null;

  constructor(
    readonly began: Began = 'made',
    readonly since = Date.now(),
  ) {}

  /** `name` painted (SERVER.statsPainters names are kept). */
  painter(name: string) {
    if (this.names.size < SERVER.statsPainters) this.names.add(name);
  }

  /** `n` players in it now. */
  players(n: number) {
    this.peak = raised(this.peak, n);
  }

  /** A player who joined at `joined` (ms) stayed till `until`: only the time since the paint began counts. */
  stay(joined: number, until: number) {
    this.played += Math.max(0, until - Math.max(joined, this.since)) / 1000;
  }

  /** Player-seconds till now, the players here (`here`: when (ms) each joined) counted too. */
  private playedNow(here: number[]) {
    const now = Date.now();
    return here.reduce((n, joined) => n + Math.max(0, now - Math.max(joined, this.since)) / 1000, this.played);
  }

  /** As the admin page gets them; `here`: when (ms) the players now in the session joined. */
  report(here: number[]) {
    return {
      since: new Date(this.since).toISOString(),
      began: this.began,
      ...(this.restoredAt === null ? {} : { restoredAt: new Date(this.restoredAt).toISOString() }),
      stamps: { ...this.paint.stamps },
      colors: { ...this.paint.colors },
      painters: this.names.size,
      playSeconds: Math.round(this.playedNow(here)),
      joins: this.joins,
      peak: this.peak,
    };
  }

  /** What is written beside a save: painters as names, the players now in it counted till now. */
  toJSON(here: number[] = []): StoredStats {
    const { began, since, joins, peak, restoredAt } = this;
    return { since, began, restoredAt, stamps: { ...this.paint.stamps }, colors: { ...this.paint.colors }, painters: [...this.names], played: this.playedNow(here), joins, peak };
  }

  /** The stats a save was written with, or null if they are not good. */
  static from(j: unknown, began?: Began, restoredAt: number | null = null): SessionStats | null {
    const o = (typeof j === 'object' && j ? j : {}) as Partial<StoredStats>;
    const ok = isCount(o.since) && (o.began === 'made' || o.began === 'wiped' || o.began === 'restored') && Array.isArray(o.painters) && o.painters.every((n) => typeof n === 'string') && isCount(o.played) && isCount(o.joins) && !!o.stamps && !!o.colors && Object.values(o.stamps).every(isCount) && Object.values(o.colors).every(isCount);
    if (!ok) return null;
    const s = new SessionStats(began ?? o.began, o.since);
    Object.assign(s.paint.stamps, o.stamps);
    Object.assign(s.paint.colors, o.colors);
    o.painters!.slice(0, SERVER.statsPainters).forEach((n) => s.names.add(n));
    s.played = o.played!;
    s.joins = o.joins!;
    s.peak = o.peak && isCount(o.peak.players) && typeof o.peak.at === 'string' ? o.peak : null;
    s.restoredAt = began ? restoredAt : isCount(o.restoredAt) ? o.restoredAt! : null;
    return s;
  }
}
