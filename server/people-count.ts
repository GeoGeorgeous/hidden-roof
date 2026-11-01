import { bump } from './tally';

// What people.ts's plays add up to over a range of hours (GET /stats/people): who, from where, on how many devices an
// address, and who is new; and a day's row for the audience history (audience.ts). Everything is distinct inside one range or
// day, by device and by address, never added across them.

export interface Play {
  h: number;
  d: string | null;
  i: string;
  c: string | null;
  /** A JOIN, and a page that reached the level: one or both (a play saved before the pages were kept has neither: it was a JOIN). */
  j?: true;
  p?: true;
  /** The day (since 1970) the device first played, and the one it played before the day of this play, as its game says (src/stored.ts): null for none; both absent when it said nothing. */
  f?: number | null;
  v?: number | null;
}

/** A day's people as counted once and kept for good (docs/admin-api.md, GET /stats/people/days). */
export interface Row {
  players: { device: number; address: number };
  inSessions: { device: number; address: number };
  newPlayers: number;
  returningPlayers: number;
  unknownPlayers: number;
  countries: Record<string, number>;
  ages: Record<string, number>;
  gaps: Record<string, number>;
  gapsNone: number;
  unknownGaps: Record<string, number>;
  unknownGapsNone: number;
  unmatched: number;
}

/** A day's row with nobody in it: what a row read from a file lacks is this. */
export const noRow = (): Row => ({
  players: { device: 0, address: 0 }, inSessions: { device: 0, address: 0 }, newPlayers: 0, returningPlayers: 0, unknownPlayers: 0,
  countries: {}, ages: {}, gaps: {}, gapsNone: 0, unknownGaps: {}, unknownGapsNone: 0, unmatched: 0,
});

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

/** Players by device, each by their last country known. */
function countriesOf(all: Play[]) {
  const last = new Map<string, string | null>();
  for (const p of all) if (p.d && (p.c || !last.has(p.d))) last.set(p.d, p.c);
  const countries: Record<string, number> = {};
  for (const c of last.values()) if (c) countries[c] = (countries[c] ?? 0) + 1;
  return countries;
}

/**
 * New, returning and unknown devices of `all` (hours from `first`): new if the oldest first day its plays say is on or after the day of `first`,
 * returning if older, unknown if no play says one (a game from before it kept one, or one that only joined).
 */
function newReturning(all: Play[], first: number) {
  const day = Math.floor(first / 24);
  const firsts = new Map<string, number>();
  for (const p of all) if (p.d && typeof p.f === 'number') firsts.set(p.d, Math.min(p.f, firsts.get(p.d) ?? Infinity));
  const fresh = [...firsts.values()].filter((f) => f >= day).length;
  return { newPlayers: fresh, returningPlayers: firsts.size - fresh, unknownPlayers: devices(all).size - firsts.size };
}

/** The day's figures of a range: players and those who joined (by device and by address), new and returning players. */
export function dayFigures(plays: Play[], first: number, end: number) {
  const all = between(plays, first, end);
  return { players: distinct(all), inSessions: distinct(all.filter((p) => p.j)), ...newReturning(all, first) };
}

/**
 * The people of hours `first` to `end`. `players`: who joined or reached the level, once by device and once by address; `inSessions`:
 * who joined; `countries`: players by device, each by their last country known; `networks` by address.
 */
export function count(plays: Play[], first: number, end: number) {
  const all = between(plays, first, end);
  const { players, inSessions, newPlayers, returningPlayers, unknownPlayers } = dayFigures(plays, first, end);
  return { players, inSessions, countries: countriesOf(all), networks: networks(all), newPlayers, returningPlayers, unknownPlayers };
}

const add = (m: Record<string, number>, k: number) => bump(m, String(k));

/**
 * The row of `day` (since 1970), or null with nobody in it. A device counts once, with the days of its first play that day that has them:
 * `ages` by days since its first play and `gaps` since its play before (none: no play before, or one not before the day), for the devices
 * that said their first day; `unknownGaps` the same for those that didn't; `unmatched` for those that said no days at all.
 */
export function dayRow(plays: Play[], day: number): Row | null {
  const all = between(plays, day * 24, day * 24 + 24);
  const players = distinct(all);
  if (!players.device && !players.address) return null;
  const said = new Map<string, Play>();
  for (const p of all) if (p.d && p.f !== undefined && !said.has(p.d)) said.set(p.d, p);
  const row: Row = { ...noRow(), players, inSessions: distinct(all.filter((p) => p.j)), countries: countriesOf(all) };
  let known = 0;
  for (const d of devices(all)) {
    const p = said.get(d);
    if (!p) {
      row.unmatched++;
      continue;
    }
    const isKnown = typeof p.f === 'number' && p.f <= day;
    if (isKnown) (known++, add(row.ages, day - (p.f as number)));
    if (typeof p.v === 'number' && p.v < day) add(isKnown ? row.gaps : row.unknownGaps, day - p.v);
    else if (isKnown) row.gapsNone++;
    else row.unknownGapsNone++;
  }
  row.newPlayers = row.ages['0'] ?? 0;
  row.returningPlayers = known - row.newPlayers;
  row.unknownPlayers = players.device - known;
  return row;
}
