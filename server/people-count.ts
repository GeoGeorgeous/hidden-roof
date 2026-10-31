import { HOUR } from './stats-period';

// What people.ts's plays add up to over a range of hours (GET /stats/people): who, from where, on how many devices an
// address, and who is new. Everything is distinct inside one range, by device and by address, never added across ranges.

export interface Play {
  h: number;
  d: string | null;
  i: string;
  c: string | null;
  /** A JOIN, and a page that reached the level: one or both (a play saved before the pages were kept has neither: it was a JOIN). */
  j?: true;
  p?: true;
}

/** The plays of hours `first` up to `end`, from `plays` (oldest first). */
function between(plays: Play[], first: number, end: number) {
  const at = (h: number) => {
    let [lo, hi] = [0, plays.length];
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (plays[mid].h < h) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return plays.slice(at(first), at(end));
}

const distinct = (list: Play[]) => ({ device: new Set(list.flatMap((p) => (p.d ? [p.d] : []))).size, address: new Set(list.map((p) => p.i)).size });
const devices = (list: Play[]) => new Set(list.flatMap((p) => (p.d ? [p.d] : [])));

/** Networks (addresses) by their devices: the ones with more than one are shared. Plays without a device don't count. */
function networks(all: Play[]) {
  const by = new Map<string, Set<string>>();
  for (const p of all) if (p.d) by.set(p.i, (by.get(p.i) ?? new Set()).add(p.d));
  const n = { shared: 0, devicesOnShared: 0, devicesPerNetwork: { '1': 0, '2-4': 0, '5+': 0 } };
  for (const set of by.values()) {
    if (set.size > 1) (n.shared++, (n.devicesOnShared += set.size));
    n.devicesPerNetwork[set.size === 1 ? '1' : set.size < 5 ? '2-4' : '5+']++;
  }
  return n;
}

/**
 * Devices in hours `first` to `end` that were seen before, and those that were not: before means since the salt in effect at `first` began,
 * up to `first`. Both null if a salt starts inside (the hashes before and after can't be matched). A first salt, with no plays before
 * it, is no change. `starts`: when each salt began (ms), oldest first.
 */
function newReturning(plays: Play[], all: Play[], starts: number[], first: number, end: number) {
  const oldest = plays[0]?.h ?? Infinity;
  if (starts.some((s) => s > first * HOUR && s < end * HOUR && s >= (oldest + 1) * HOUR)) return { newPlayers: null, returningPlayers: null };
  const began = starts.filter((s) => s <= first * HOUR).pop();
  const before = devices(between(plays, began === undefined ? 0 : Math.floor(began / HOUR), first));
  const now = devices(all);
  const returning = [...now].filter((d) => before.has(d)).length;
  return { newPlayers: now.size - returning, returningPlayers: returning };
}

/** The day's figures of a range: players and those who joined (by device and by address), new and returning players. */
export function dayFigures(plays: Play[], starts: number[], first: number, end: number) {
  const all = between(plays, first, end);
  return { players: distinct(all), inSessions: distinct(all.filter((p) => p.j)), ...newReturning(plays, all, starts, first, end) };
}

/**
 * The people of hours `first` to `end`. `players`: who joined or reached the level, once by device and once by address; `inSessions`:
 * who joined; `countries`: players by device, each by their last country known; `networks` by address.
 */
export function count(plays: Play[], starts: number[], first: number, end: number) {
  const all = between(plays, first, end);
  const last = new Map<string, string | null>();
  for (const p of all) if (p.d && (p.c || !last.has(p.d))) last.set(p.d, p.c);
  const countries: Record<string, number> = {};
  for (const c of last.values()) if (c) countries[c] = (countries[c] ?? 0) + 1;
  const { players, inSessions, newPlayers, returningPlayers } = dayFigures(plays, starts, first, end);
  return { players, inSessions, countries, networks: networks(all), newPlayers, returningPlayers };
}
