import path from 'node:path';
import { COLOR_ORDER } from '../src/config';
import { dayName } from './days';
import { history, read, sum, type Hour } from './history';
import { readJson } from './json-file';

// GET /stats/play/days and /stats/paint/days (docs/admin-api.md, History): the history's days. A day's figures come from
// its hours while they are kept (history.ts), then from its file (stats/<day>.json): the total it keeps forever, or the
// hours it still has (a long-running server turns a day into a total only at its next start).

/** Day `d` (since 1970) added up: from its hours in memory, else from its file in `dir`/stats (its total, or its hours added up), else none. */
async function totalOf(d: number, dir: string | null): Promise<Hour | null> {
  const hours = history.within({ first: d * 24, end: d * 24 + 24 });
  if (hours.length) return sum(hours.map(([, h]) => h));
  if (!dir) return null;
  try {
    const file = await readJson<{ total?: Hour; hours?: Record<string, Hour> }>(path.join(dir, 'stats', `${dayName(d)}.json`));
    if (file?.total) return read(file.total);
    return file?.hours ? sum(Object.values(file.hours).map(read)) : null;
  } catch {
    return null;
  }
}

const none = (o: object) => !Object.keys(o).length;

/** The rows of `group` for the days `range.from` to `range.to` (days since 1970), oldest first, a day with no counts left out. `dir`: DATA_DIR or null (memory only). */
export async function historyDays(group: 'play' | 'paint', range: { from: number; to: number }, dir: string | null) {
  const days: object[] = [];
  for (let d = range.from; d <= range.to; d++) {
    const t = await totalOf(d, dir);
    if (!t) continue;
    const day = dayName(d);
    if (group === 'play') {
      if (t.plays || t.seconds || !none(t.minutes) || !none(t.turnedAway)) days.push({ day, plays: t.plays, playSeconds: Math.round(t.seconds), withOthers: Math.round(t.withOthers), lengthMinutes: t.minutes, turnedAway: t.turnedAway, peak: t.peak });
    } else if (Object.values(t.stamps).some(Boolean) || !none(t.colors)) {
      days.push({ day, stamps: t.stamps, colors: Object.fromEntries(COLOR_ORDER.flatMap((c) => (t.colors[c] ? [[c, t.colors[c]]] : []))) });
    }
  }
  return { from: dayName(range.from), to: dayName(range.to), days };
}
