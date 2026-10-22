// Evaluating a hint's conditions against what the game told the tutorial.

import { TUTORIAL } from '../config.ts';
import type { Amount, Cond, Fact, Snapshot } from './types.ts';

/** What a hint has seen since it was wanted. */
export interface Seen {
  totals: Map<string, number>;
  events: Set<string>;
  pressed: Set<string>;
}

export const newSeen = (): Seen => ({ totals: new Map(), events: new Set(), pressed: new Set() });

export interface Ctx {
  snap: Snapshot;
  /** Visible seconds of play. */
  played: number;
  seen: Seen;
}

export const amount = (a: Amount) => (typeof a === 'number' ? a : TUTORIAL[a]);

/** The key a fact's amount is summed under: 'moved', 'used:marker'. */
const totalKey = (type: string, tool?: string) => (tool ? `${type}:${tool}` : type);

/** Records a fact for a hint that is wanted. */
export function see(seen: Seen, f: Fact) {
  seen.events.add(f.type);
  if (f.type === 'pressed') seen.pressed.add(f.action);
  const n = f.type === 'moved' || f.type === 'climbed' ? f.meters : f.type === 'sprinted' ? f.seconds : f.type === 'used' ? f.amount : 0;
  if (!n) return;
  for (const key of f.type === 'used' ? [f.type, totalKey(f.type, f.tool)] : [f.type]) seen.totals.set(key, (seen.totals.get(key) ?? 0) + n);
}

export function holds(c: Cond, x: Ctx): boolean {
  if ('owns' in c) return x.snap.tools.includes(c.owns);
  if ('has' in c) return (c.has === 'colors' ? x.snap.colors : x.snap.caps) >= c.atLeast;
  if ('holding' in c) return x.snap.tool === c.holding;
  if ('pressed' in c) return x.seen.pressed.has(c.pressed);
  if ('near' in c) return x.snap.nearLadder || x.snap.onLadder;
  if ('total' in c) return (x.seen.totals.get(totalKey(c.total, c.tool)) ?? 0) >= amount(c.atLeast);
  if ('event' in c) return x.seen.events.has(c.event);
  if ('playedFor' in c) return x.played >= amount(c.playedFor);
  if ('all' in c) return c.all.every((k) => holds(k, x));
  return c.any.some((k) => holds(k, x));
}
