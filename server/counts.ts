import { COLOR_ORDER, SERVER, type PaintColor } from '../src/config';
import type { InventoryData } from '../src/inventory/inventory';
import { foundCodes, rgbOf } from '../src/inventory/items';
import { opTool, type PaintOp } from '../src/paint-ops';
import type { Rgb } from '../src/painting';

// What the admin page counts (admin/): plain additions on paths that
// already run, never a pass of their own over the paint.

/** The median of `sorted` (ascending): the middle one, or the mean of the two in the middle; null for none. */
export const median = (sorted: number[]) => (sorted.length ? (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2 : null);

/** Bytes sent to games and received from them since the start (main.ts adds each frame and message), for the rates each way. */
export const traffic = { sent: 0, received: 0 };

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

type ByTool = { can: number; marker: number; roller: number; sponge: number };

/** Stamps and seconds painting by tool (the sponge's are paint cleaned), and ops by color. */
export interface Paint {
  stamps: ByTool;
  paintSeconds: ByTool;
  colors: Partial<Record<PaintColor, number>>;
}

const byTool = (): ByTool => ({ can: 0, marker: 0, roller: 0, sponge: 0 });
export const noPaint = (): Paint => ({ stamps: byTool(), paintSeconds: byTool(), colors: {} });

/** Each painter's last op time (s, their clock) by tool: ops SERVER.paintGap apart or closer are one run. */
const lastOp = new WeakMap<object, Partial<ByTool>>();

/** Ops `painter` painted at times `t` (s, their clock), counted into each of `into` (a run is no one's stamp). */
export function countPaint(ops: readonly PaintOp[], t: readonly number[], painter: object, into: Paint[]) {
  const last = lastOp.get(painter) ?? {};
  lastOp.set(painter, last);
  ops.forEach((op, i) => {
    const tool = opTool(op);
    const stamp = tool === 'can' || tool === 'marker' || tool === 'roller' || tool === 'sponge' ? tool : null;
    const c = op.kind !== 'drip' && op.color ? colorOf(op.color) : null;
    const gap = stamp ? t[i] - (last[stamp] ?? -Infinity) : 0;
    if (stamp) last[stamp] = t[i];
    for (const p of into) {
      if (stamp) p.stamps[stamp]++;
      if (stamp && gap > 0 && gap <= SERVER.paintGap) p.paintSeconds[stamp] += gap;
      if (c) p.colors[c] = (p.colors[c] ?? 0) + 1;
    }
  });
}

/** Seconds by tool as the admin page gets them: to a tenth. */
export const paintSecondsOf = (b: ByTool) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Math.round(v * 10) / 10])) as ByTool;

/** How a session's paint began. */
type Began = 'made' | 'wiped' | 'restored';

/** What `SessionStats.toJSON` writes beside a save (kept.ts). */
interface StoredStats {
  since: number;
  began: Began;
  restoredAt: number | null;
  stamps: Paint['stamps'];
  /** Missing in a save from before paint time, pickups and players were kept: none. */
  paintSeconds?: Paint['paintSeconds'];
  colors: Paint['colors'];
  painters: string[];
  players?: string[];
  /** By pickup code (items.ts pickupCode), the names who found it. */
  pickups?: Record<string, string[]>;
  played: number;
  joins: number;
  peak: { players: number; at: string } | null;
}

/** `peak` or `n` players now, whichever is more. */
export const raised = (peak: { players: number; at: string } | null, n: number) => (n > (peak?.players ?? 0) ? { players: n, at: new Date().toISOString() } : peak);

const isCount = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
/** A save's list of names, at most SERVER.statsPainters; none if it isn't one. */
const names = (v: unknown) => (Array.isArray(v) ? v.filter((n): n is string => typeof n === 'string').slice(0, SERVER.statsPainters) : []);

/**
 * A session's counts since its paint began (made, wiped or restored), counted
 * where the day's are: the admin page's `stats`. Each save has them beside it on
 * disk (kept.ts); a wipe zeroes them and a restore brings the save's back.
 */
export class SessionStats {
  /** Stamps by tool and ops by color (countPaint). */
  readonly paint = noPaint();
  private names = new Set<string>();
  /** The names of everyone who was in it, and by pickup code the names who found it (SERVER.statsPainters names each). */
  private seen = new Set<string>();
  private found = new Map<string, Set<string>>();
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

  /** `name` is in it, `n` players with them. */
  players(n: number, name: string) {
    this.peak = raised(this.peak, n);
    if (this.seen.size < SERVER.statsPainters) this.seen.add(name);
  }

  /** `name` carries `now`, having carried `before` (null: the starting kit): what's new in it they found. */
  carries(name: string, before: InventoryData | null, now: InventoryData) {
    const had = new Set(before ? foundCodes(before) : []);
    for (const code of foundCodes(now)) {
      if (had.has(code)) continue;
      const names = this.found.get(code) ?? new Set<string>();
      this.found.set(code, names);
      if (names.size < SERVER.statsPainters) names.add(name);
    }
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
      paintSeconds: paintSecondsOf(this.paint.paintSeconds),
      colors: { ...this.paint.colors },
      painters: this.names.size,
      players: this.seen.size,
      pickups: Object.fromEntries([...this.found].map(([code, names]) => [code, names.size])),
      playSeconds: Math.round(this.playedNow(here)),
      joins: this.joins,
      peak: this.peak,
    };
  }

  /** What is written beside a save: painters as names, the players now in it counted till now. */
  toJSON(here: number[] = []): StoredStats {
    const { began, since, joins, peak, restoredAt } = this;
    const pickups = Object.fromEntries([...this.found].map(([code, names]) => [code, [...names]]));
    return { since, began, restoredAt, stamps: { ...this.paint.stamps }, paintSeconds: { ...this.paint.paintSeconds }, colors: { ...this.paint.colors }, painters: [...this.names], players: [...this.seen], pickups, played: this.playedNow(here), joins, peak };
  }

  /** The stats a save was written with, or null if they are not good. */
  static from(j: unknown, began?: Began, restoredAt: number | null = null): SessionStats | null {
    const o = (typeof j === 'object' && j ? j : {}) as Partial<StoredStats>;
    const ok = isCount(o.since) && (o.began === 'made' || o.began === 'wiped' || o.began === 'restored') && Array.isArray(o.painters) && o.painters.every((n) => typeof n === 'string') && isCount(o.played) && isCount(o.joins) && !!o.stamps && !!o.colors && Object.values(o.stamps).every(isCount) && Object.values(o.colors).every(isCount);
    if (!ok) return null;
    const s = new SessionStats(began ?? o.began, o.since);
    Object.assign(s.paint.stamps, o.stamps);
    if (o.paintSeconds && Object.values(o.paintSeconds).every(isCount)) Object.assign(s.paint.paintSeconds, o.paintSeconds);
    Object.assign(s.paint.colors, o.colors);
    o.painters!.slice(0, SERVER.statsPainters).forEach((n) => s.names.add(n));
    names(o.players).forEach((n) => s.seen.add(n));
    for (const [code, who] of Object.entries(o.pickups ?? {})) s.found.set(code, new Set(names(who)));
    s.played = o.played!;
    s.joins = o.joins!;
    s.peak = o.peak && isCount(o.peak.players) && typeof o.peak.at === 'string' ? o.peak : null;
    s.restoredAt = began ? restoredAt : isCount(o.restoredAt) ? o.restoredAt! : null;
    return s;
  }
}
