import fs from 'node:fs/promises';
import path from 'node:path';
import { COLOR_ORDER } from '../src/config';
import { history, read, sum, type Hour } from './history';
import { dayName } from './stats-period';

// GET /stats/play/days and /stats/paint/days (docs/admin-api.md, History): the history's days. A day's figures come from
// its hours while they are kept (history.ts), then from the total its file keeps (stats/<day>.json) forever.

/** Day `d` (since 1970) added up: from its hours in memory, else from the total of its file in `dir`/stats, else none. */
async function totalOf(d: number, dir: string | null): Promise<Hour | null> {
  const hours = history.within({ first: d * 24, end: d * 24 + 24 });
  if (hours.length) return sum(hours.map(([, h]) => h));
  if (!dir) return null;
  try {
    const file = JSON.parse(await fs.readFile(path.join(dir, 'stats', `${dayName(d)}.json`), 'utf8')) as { total?: Hour };
    return file.total ? read(file.total) : null;
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
