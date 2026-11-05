import fs from 'node:fs/promises';
import path from 'node:path';
import { SERVER } from '../src/config';
import { writeAtomic } from './atomic';
import { dayName, dayOfFile, today } from './days';
import { readJson } from './json-file';
import { MonthSalt, type Salt } from './month-salt';
import { blank, type Day, type Hour } from './traffic-count';

// The traffic reader's files (traffic.ts), in DATA_DIR/traffic: <day>.json, a day's counts, kept forever (they
// are small); hours-<day>.json, the day's hours with their visitors' hashes, kept SERVER.historyDays days (owner-only);
// months.json, the months ended with their visitors, kept forever; state.json, where in the log it is, the salt of the
// hashes and the day being counted (owner-only).

/** Where the reader is: the log file (its inode) and how far in it, the visitors' salt (replaced at each month's start, UTC), and the name of the day being counted. */
export interface State {
  inode: number;
  offset: number;
  salt: MonthSalt | null;
  today: string | null;
}

/** A JSON file, or null if it's missing or not JSON. */
const read = <T>(file: string) => readJson<T>(file).catch(() => null);

/** `data` as JSON in `file`, whole or not at all. */
export const write = (file: string, data: unknown, mode = 0o644) => writeAtomic(file, JSON.stringify(data), mode);

/** The state, or null (none, or not readable). */
export async function readState(dir: string): Promise<State | null> {
  const s = await read<Omit<State, 'salt'> & { salt: Salt | null }>(path.join(dir, 'state.json'));
  if (!s || !Number.isFinite(s.offset)) return null;
  const today = typeof s.today === 'string' ? s.today : null;
  const salt = typeof s.salt?.key === 'string' && Number.isFinite(s.salt.since) ? new MonthSalt(s.salt) : null;
  return { inode: s.inode, offset: s.offset, salt, today };
}
export const readDay = (dir: string, name: string) => read<Day>(path.join(dir, `${name}.json`));

/** When the reader last finished a pass (ms): state.json is written at the end of each, or null (none). */
export const trafficAt = (dir: string) => fs.stat(path.join(dir, 'traffic', 'state.json')).then((s) => s.mtimeMs, () => null);

/** The hours file of a day. */
const hoursFile = (dir: string, day: string) => path.join(dir, `hours-${day}.json`);
type HoursJson = Record<string, { views?: number; bots?: number; seen?: Record<string, number>; countries?: Record<string, string> }>;

/** A day's hours as written, or none: new maps each time, to count into. */
export async function readHours(dir: string, day: string) {
  return hoursOf((await read<HoursJson>(hoursFile(dir, day))) ?? {});
}

function hoursOf(json: HoursJson) {
  const hours = new Map<number, Hour>();
  for (const [k, h] of Object.entries(json)) if (Number.isInteger(+k) && h && typeof h === 'object') hours.set(+k, { views: h.views ?? 0, bots: h.bots ?? 0, seen: new Map(Object.entries(h.seen ?? {})), countries: new Map(Object.entries(h.countries ?? {})) });
  return hours;
}

/** The hours files parsed, by file: kept while the file is as it was (its inode, time and size), up to SERVER.trafficCacheSeen visitors in all, the oldest read going first. */
const parsed = new Map<string, { sig: string; hours: Map<number, Hour>; seen: number }>();
let cached = 0;

/** A day's hours as written, or none, from what was read last if the file has not changed: to read from, never to change. */
export async function keptHours(dir: string, day: string) {
  const file = hoursFile(dir, day);
  const st = await fs.stat(file).catch(() => null);
  if (!st) return new Map<number, Hour>();
  const sig = `${st.ino} ${st.mtimeMs} ${st.size}`;
  const had = parsed.get(file);
  if (had?.sig === sig) {
    parsed.delete(file);
    parsed.set(file, had);
    return had.hours;
  }
  if (had) (parsed.delete(file), (cached -= had.seen));
  const hours = await readHours(dir, day);
  const seen = [...hours.values()].reduce((n, h) => n + h.seen.size, 0);
  parsed.set(file, { sig, hours, seen });
  cached += seen;
  for (const [f, old] of parsed) {
    if (cached <= SERVER.trafficCacheSeen || parsed.size <= 1) break;
    (parsed.delete(f), (cached -= old.seen));
  }
  return hours;
}

/** A day's hours written, for its owner only. */
export const writeHours = (dir: string, day: string, hours: Map<number, Hour>) =>
  write(hoursFile(dir, day), Object.fromEntries([...hours].map(([k, h]) => [k, { views: h.views, bots: h.bots, seen: Object.fromEntries(h.seen), countries: Object.fromEntries(h.countries) }])), 0o600);

/** Hours files past SERVER.historyDays deleted: a period of that many days has no use for them. */
export async function pruneHours(dir: string) {
  const keep = today() - SERVER.historyDays;
  for (const name of await fs.readdir(dir).catch(() => [] as string[])) {
    const day = dayOfFile(name, 'hours-', '.json');
    if (day !== null && day < keep) await fs.rm(path.join(dir, name), { force: true });
  }
}

/** The days from `range.from` to `range.to` (days since 1970) that have a file, oldest first (GET /stats/traffic/days). `dir`: DATA_DIR/traffic (none: no days). A day counted before a figure was has none of it. */
export async function trafficDays(dir: string | null, range: { from: number; to: number }) {
  const [from, to] = [dayName(range.from), dayName(range.to)];
  const names = dir ? (await fs.readdir(dir).catch(() => [] as string[])).flatMap((f) => {
    const d = dayOfFile(f, '', '.json');
    return d === null ? [] : [dayName(d)];
  }).filter((d) => d >= from && d <= to).sort() : [];
  // A day whose file doesn't read is left out, as a day without one.
  const days = await Promise.all(names.map(async (day) => ({ day, counts: await readDay(dir!, day) })));
  return { from, to, days: days.flatMap(({ day, counts }) => (counts ? [{ day, ...blank(), ...counts }] : [])) };
}

/** A month's counts (GET /stats/traffic/months), as months.json keeps them. */
export interface Month {
  views: number;
  bots: number;
  visitors: number;
  visitorCountries: Record<string, number>;
  steps: Record<string, number>;
  /** None in a month written before the marks. */
  boot?: Record<string, number>;
  /** One salt covered the month: a visitor is counted once. */
  exact: boolean;
}

/** months.json: the months ended, by YYYY-MM, kept forever. None if missing. */
export async function readMonths(dir: string) {
  const months = await read<Record<string, Month>>(path.join(dir, 'months.json'));
  return months && typeof months === 'object' ? months : {};
}
export const writeMonths = (dir: string, months: Record<string, Month>) => write(path.join(dir, 'months.json'), months);
