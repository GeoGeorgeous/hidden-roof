import fs from 'node:fs/promises';
import path from 'node:path';
import { SERVER } from '../src/config';
import { writeAtomic } from './atomic';
import type { Day, Hour } from './traffic-count';

// The traffic reader's files (traffic.ts), in DATA_DIR/traffic: <day>.json, a day's counts, kept forever (they
// are small); hours-<day>.json, the day's hours with their visitors' hashes, kept SERVER.historyDays days (owner-only);
// state.json, where in the log it is, the salt of the hashes and the day being counted (owner-only).

/** Where the reader is: the log file (its inode) and how far in it, the visitors' salt (changed every SERVER.saltDays), and the name of the day being counted. */
export interface State {
  inode: number;
  offset: number;
  salt: { key: string; since: number } | null;
  today: string | null;
}

const DAY = /^(\d{4}-\d\d-\d\d)\.json$/;
/** A JSON file, or null if it's missing or not JSON. */
async function read<T>(file: string) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** `data` as JSON in `file`, whole or not at all. */
export const write = (file: string, data: unknown, mode = 0o644) => writeAtomic(file, JSON.stringify(data), mode);

/** The state, or null (none, or not readable). One written before the hours were kept has the day's hashes in `today`: only its name is taken, and no salt. */
export async function readState(dir: string): Promise<State | null> {
  const s = await read<Omit<State, 'today'> & { today?: unknown }>(path.join(dir, 'state.json'));
  if (!s || !Number.isFinite(s.offset)) return null;
  const today = typeof s.today === 'string' ? s.today : typeof (s.today as { name?: unknown } | null)?.name === 'string' ? (s.today as { name: string }).name : null;
  const salt = typeof s.salt?.key === 'string' && Number.isFinite(s.salt.since) ? s.salt : null;
  return { inode: s.inode, offset: s.offset, salt, today };
}
export const readDay = (dir: string, name: string) => read<Day>(path.join(dir, `${name}.json`));

/** When the reader last finished a pass (ms): state.json is written at the end of each, or null (none). */
export const trafficAt = (dir: string) => fs.stat(path.join(dir, 'traffic', 'state.json')).then((s) => s.mtimeMs, () => null);

/** The hours file of a day. */
const hoursFile = (dir: string, day: string) => path.join(dir, `hours-${day}.json`);
type HoursJson = Record<string, { views?: number; bots?: number; seen?: Record<string, number> }>;

/** A day's hours as written, or none. */
export async function readHours(dir: string, day: string) {
  const json = (await read<HoursJson>(hoursFile(dir, day))) ?? {};
  const hours = new Map<number, Hour>();
  for (const [k, h] of Object.entries(json)) if (Number.isInteger(+k) && h && typeof h === 'object') hours.set(+k, { views: h.views ?? 0, bots: h.bots ?? 0, seen: new Map(Object.entries(h.seen ?? {})) });
  return hours;
}

/** A day's hours written, for its owner only. */
export const writeHours = (dir: string, day: string, hours: Map<number, Hour>) =>
  write(hoursFile(dir, day), Object.fromEntries([...hours].map(([k, h]) => [k, { views: h.views, bots: h.bots, seen: Object.fromEntries(h.seen) }])), 0o600);

/** Hours files past SERVER.historyDays deleted: a period of that many days has no use for them. */
export async function pruneHours(dir: string) {
  const keep = new Date(Date.now() - SERVER.historyDays * 864e5).toISOString().slice(0, 10);
  for (const name of await fs.readdir(dir).catch(() => [] as string[])) {
    const m = /^hours-(\d{4}-\d\d-\d\d)\.json$/.exec(name);
    if (m && m[1] < keep) await fs.rm(path.join(dir, name), { force: true });
  }
}

/** The last `n` days up to today with a file, oldest first (GET /traffic). */
export async function trafficDays(dir: string, n: number) {
  const first = new Date(Date.now() - (n - 1) * 864e5).toISOString().slice(0, 10);
  const names = (await fs.readdir(path.join(dir, 'traffic')).catch(() => [] as string[])).flatMap((f) => DAY.exec(f)?.[1] ?? []).filter((d) => d >= first).sort();
  // A day whose file doesn't read is left out, as a day without one.
  const days = await Promise.all(names.map(async (day) => ({ day, counts: await readDay(path.join(dir, 'traffic'), day) })));
  return { days: days.flatMap(({ day, counts }) => (counts ? [{ day, ...counts }] : [])) };
}
