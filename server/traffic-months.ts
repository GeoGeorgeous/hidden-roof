import { SERVER } from '../src/config';
import { dayAt, DAY, dayName } from './days';
import { monthName, monthOfDay, monthStart } from './stats-period';
import { noMarks } from './traffic-count';
import { figures } from './traffic-period';
import { readDay, readMonths, readState, writeMonths, type Month } from './traffic-store';

// The site's months (GET /stats/traffic/months, docs/admin-api.md, History): each visitor once in the month. The reader
// writes a month into months.json when its salt is replaced at the month's end; this month, and months whose hours are
// still kept, are counted from the hours.

/** A salt that began this much after a month's first day (ms) still covered the month. */
const SLACK = 60e3;

/** `month` (months since 1970) from its hours files and day files in `dir` (DATA_DIR/traffic), or null if it has no counts. `since`: when the salt that covered it began (ms). */
async function counted(dir: string, month: number, since: number): Promise<Month | null> {
  const [first, end] = [monthStart(month), monthStart(month + 1)];
  const f = await figures(dir, { first: first * 24, end: end * 24 });
  let [views, bots] = [0, 0];
  for (let d = first; d < end; d++) {
    const day = await readDay(dir, dayName(d));
    views += day?.views ?? 0;
    bots += day?.bots ?? 0;
  }
  if (!views && !bots && !f.visitors) return null;
  return { views, bots, visitors: f.visitors, visitorCountries: f.visitorCountries, steps: f.steps, boot: f.boot, exact: since <= first * DAY + SLACK };
}

/** The salt that began at `since` (ms) is replaced at `now`: the months it covered that have ended are written to months.json (counts only; one already there stays). `dir`: DATA_DIR/traffic. */
export async function closeMonths(dir: string, since: number, now: number) {
  const [months, last] = [await readMonths(dir), monthOfDay(dayAt(now)) - 1];
  let changed = false;
  for (let m = monthOfDay(dayAt(since)); m <= last; m++) {
    const counts = months[monthName(m)] ? null : await counted(dir, m, since);
    if (counts) [months[monthName(m)], changed] = [counts, true];
  }
  if (changed) await writeMonths(dir, months);
}

/** The months from `range.from` to `range.to` (months since 1970) that are known, oldest first. `dir`: DATA_DIR/traffic (none: no months); `now`: ms. */
export async function trafficMonths(dir: string | null, range: { from: number; to: number }, now: number) {
  const [from, to] = [monthName(range.from), monthName(range.to)];
  const out: (Month & { month: string })[] = [];
  if (dir) {
    const [kept, day, since] = [await readMonths(dir), dayAt(now), (await readState(dir))?.salt?.since ?? Infinity];
    for (let m = range.from; m <= range.to; m++) {
      // A month not written is counted if all its hours are still kept: this month, or one that began within SERVER.historyDays.
      const counts = kept[monthName(m)] ?? (monthStart(m) >= day - SERVER.historyDays ? await counted(dir, m, since) : null);
      if (counts) out.push({ month: monthName(m), boot: noMarks(), ...counts });
    }
  }
  return { from, to, months: out };
}
