import path from 'node:path';
import { writeAtomic } from './atomic';
import { dayName, dayOf } from './days';
import { readJson } from './json-file';
import { log } from './log';
import { noRow, type Row } from './people-count';
import { filled } from './tally';

// The audience by day, kept forever as counts only (docs/admin-api.md, Kept for how long): a file a year,
// stats/audience-<YYYY>.json, an object of each ended day's row by its day. Only the owner may read them.

const fileOf = (year: string) => `audience-${year}.json`;

/** The rows of `year` (YYYY) in `dir`, by day (YYYY-MM-DD); {} without the file, null if it can't be read (it is then left alone). */
async function readYear(dir: string, year: string): Promise<Record<string, Row> | null> {
  try {
    const rows = await readJson<unknown>(path.join(dir, fileOf(year)));
    if (rows === null) return {};
    if (typeof rows === 'object' && !Array.isArray(rows)) return rows as Record<string, Row>;
    log('-----', `stats ${fileOf(year)} skipped: not an object of rows`);
  } catch (e) {
    log('-----', `stats ${fileOf(year)} skipped:`, e);
  }
  return null;
}

/** Every row of the days `from` to `to` (since 1970) that `dir` has, by day: a row lacks nothing, at any depth (a file from before a figure was kept). */
export async function readDays(dir: string, from: number, to: number) {
  const rows = new Map<number, Row>();
  for (let year = +dayName(from).slice(0, 4); year <= +dayName(to).slice(0, 4); year++) {
    const kept = await readYear(dir, String(year));
    for (const [name, row] of Object.entries(kept ?? {})) {
      const day = dayOf(name);
      if (day !== null && day >= from && day <= to) rows.set(day, filled(noRow(), row));
    }
  }
  return rows;
}

/**
 * Add `rows` (by day since 1970) to `dir`'s year files, a day that has a row already left as it is. Returns the days it has a row for now: a
 * file it can't read is left alone, and its days are not among them.
 */
export async function writeDays(dir: string, rows: Map<number, Row>) {
  const done = new Set<number>();
  for (const year of new Set([...rows.keys()].map((d) => dayName(d).slice(0, 4)))) {
    const kept = await readYear(dir, year);
    if (!kept) continue;
    const days = [...rows].filter(([d]) => dayName(d).startsWith(year));
    const fresh = days.filter(([d]) => !(dayName(d) in kept));
    for (const [d, row] of fresh) kept[dayName(d)] = row;
    if (fresh.length) await writeAtomic(path.join(dir, fileOf(year)), JSON.stringify(Object.fromEntries(Object.entries(kept).sort(([a], [b]) => (a < b ? -1 : 1)))), 0o600);
    for (const [d] of days) done.add(d);
  }
  return done;
}
