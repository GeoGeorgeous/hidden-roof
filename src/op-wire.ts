import type { PaintOp } from './paint-ops';
import type { Rgb } from './painting';

// Paint ops on the wire (BL-024): their precision, and their bytes. Every
// number an op carries is rounded to what its bytes hold, and the painter
// paints with the rounded numbers too (painting.ts, paint-drips.ts), so every
// client and the server paint the very same texels from the bytes. A surface
// goes as its place among the session's surface keys, sorted (SurfaceIndex):
// the same on every client, since their surfaceTable matches the server's.
// No runtime imports: Node runs this file as is (scripts/protocol.test.mjs).

const U16 = 65535;
const I16 = 32767;
/** Lengths in 0.1 mm, up to 6.5 m; speeds in 0.1 mm/s. */
const TENTH_MM = 10000;
const MAX_M = U16 / TENTH_MM;
const clamp = (x: number, lo: number, hi: number) => (x > lo ? (x < hi ? x : hi) : lo);

/** A 0..1 number (u, v across a face, amounts, softness, color) as it travels. */
const unit = (x: number) => Math.round(clamp(x, 0, 1) * U16) / U16;
/** Meters (or meters a second) as they travel: to 0.1 mm. */
const meters = (x: number) => Math.round(clamp(x, 0, MAX_M) * TENTH_MM) / TENTH_MM;
/** A direction's component (-1..1) as it travels. */
const signed = (x: number) => Math.round(clamp(x, -1, 1) * I16) / I16;
/** Each number of an op as it travels: what the painter paints with too. */
export const wire = { unit, meters, signed, rgb: (c: Rgb): Rgb => [unit(c[0]), unit(c[1]), unit(c[2])] };

/** The session's surfaces by place: their keys, sorted. */
export class SurfaceIndex {
  readonly keys: string[];
  private at = new Map<string, number>();
  constructor(keys: Iterable<string>) {
    this.keys = [...new Set(keys)].sort();
    this.keys.forEach((k, i) => this.at.set(k, i));
  }
  indexOf(key: string) {
    return this.at.get(key);
  }
}

const KINDS = ['stamp', 'roll', 'drip'] as const;
const SQUARE = 4;
const SCRUB = 8;
/** Per op: kind and flags u8, time u16 (ms after the batch's first), surface u16, rect u16, u u16, v u16. */
const HEAD = 11;
const SIZE = { stamp: HEAD + 6 + 6, roll: HEAD + 6 + 8 + 6, drip: HEAD + 4 + 6 } as const;
const sizeOf = (op: PaintOp) => SIZE[op.kind] - (op.kind === 'stamp' && !op.color ? 6 : 0);

/**
 * A batch of ops, made at times `t` (s, the sender's clock): the first time as
 * an f64, then each op. An op on a surface the index doesn't have is left out.
 */
export function encodeOps(t: readonly number[], ops: readonly PaintOp[], surfaces: SurfaceIndex): Uint8Array {
  const keep = ops.map((op) => surfaces.indexOf(op.key));
  const n = ops.reduce((sum, op, i) => sum + (keep[i] === undefined ? 0 : sizeOf(op)), 8);
  const out = new Uint8Array(n);
  const d = new DataView(out.buffer);
  const t0 = t[0] ?? 0;
  d.setFloat64(0, t0, true);
  let o = 8;
  const u16 = (x: number) => (d.setUint16(o, x, true), (o += 2));
  const i16 = (x: number) => (d.setInt16(o, x, true), (o += 2));
  const color = (c: Rgb) => c.forEach((x) => u16(Math.round(unit(x) * U16)));
  ops.forEach((op, i) => {
    const s = keep[i];
    if (s === undefined) return;
    const flags = (op.kind === 'stamp' && op.square ? SQUARE : 0) | (op.kind === 'stamp' && !op.color ? SCRUB : 0);
    d.setUint8(o++, KINDS.indexOf(op.kind) | flags);
    u16(Math.round(clamp((t[i] - t0) * 1000, 0, U16)));
    u16(s);
    u16(op.rect);
    u16(Math.round(unit(op.u) * U16));
    u16(Math.round(unit(op.v) * U16));
    if (op.kind === 'stamp') {
      u16(Math.round(meters(op.radius) * TENTH_MM));
      u16(Math.round(unit(op.amount) * U16));
      u16(Math.round(unit(op.softness) * U16));
      if (op.color) color(op.color);
    } else if (op.kind === 'roll') {
      op.axis.forEach((x) => i16(Math.round(signed(x) * I16)));
      u16(Math.round(meters(op.halfLength) * TENTH_MM));
      u16(Math.round(meters(op.halfWidth) * TENTH_MM));
      u16(Math.round(unit(op.edge) * U16));
      u16(Math.round(unit(op.amount) * U16));
      color(op.color);
    } else {
      u16(Math.round(meters(op.length) * TENTH_MM));
      u16(Math.round(meters(op.speed) * TENTH_MM));
      color(op.rgb);
    }
  });
  return out;
}

/** The ops of a batch, or null if the bytes aren't one (cut short, an unknown kind, a surface not in the index, a run with no length or speed: it would never end). */
export function decodeOps(bytes: Uint8Array, surfaces: SurfaceIndex): { t: number[]; ops: PaintOp[] } | null {
  if (bytes.length < 8) return null;
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const t0 = d.getFloat64(0, true);
  if (!Number.isFinite(t0)) return null;
  const t: number[] = [];
  const ops: PaintOp[] = [];
  let o = 8;
  const u16 = () => ((o += 2), d.getUint16(o - 2, true));
  const i16 = () => ((o += 2), d.getInt16(o - 2, true) / I16);
  const un = () => u16() / U16;
  const m = () => u16() / TENTH_MM;
  const color = (): Rgb => [un(), un(), un()];
  while (o < bytes.length) {
    if (bytes.length - o < HEAD) return null;
    const flags = d.getUint8(o++);
    const kind = KINDS[flags & 3];
    if (!kind) return null;
    const scrub = kind === 'stamp' && flags & SCRUB;
    if (bytes.length - o + 1 < SIZE[kind] - (scrub ? 6 : 0)) return null;
    t.push(t0 + u16() / 1000);
    const key = surfaces.keys[u16()];
    if (key === undefined) return null;
    const at = { key, rect: u16(), u: un(), v: un() };
    if (kind === 'stamp') ops.push({ kind, ...at, radius: m(), amount: un(), softness: un(), color: scrub ? null : color(), square: !!(flags & SQUARE) });
    else if (kind === 'roll') ops.push({ kind, ...at, axis: [i16(), i16(), i16()], halfLength: m(), halfWidth: m(), edge: un(), amount: un(), color: color() });
    else {
      const [length, speed] = [m(), m()];
      if (!length || !speed) return null;
      ops.push({ kind, ...at, length, speed, rgb: color() });
    }
  }
  return { t, ops };
}
