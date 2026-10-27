import fs from 'node:fs/promises';
import { firstHour, HOUR, type Period } from './history';
import { STEPS } from './traffic-count';
import { readHours } from './traffic-store';

// GET /traffic?period=P (admin-api.ts): the web traffic over the same rolling hours as /history, from the reader's
// hours files (traffic-store.ts). Each visitor counts once over the period, at each step they got to.

const dayName = (day: number) => new Date(day * 864e5).toISOString().slice(0, 10);

/** The traffic in `period` up to now: { period, from, to, views, bots, visitors, steps }. `dir`: DATA_DIR/traffic (none: no traffic). `from`: the period's start, or when the hours begin if that's later. */
export async function trafficPeriod(dir: string | null, period: Period) {
  const now = Date.now();
  const first = firstHour(period, now);
  const seen = new Map<string, number>();
  let [views, bots] = [0, 0];
  for (let day = Math.floor(first / 24); day <= Math.floor(now / HOUR / 24); day++) {
    for (const [k, h] of dir ? await readHours(dir, dayName(day)) : []) {
      if (day * 24 + k < first) continue;
      views += h.views;
      bots += h.bots;
      for (const [id, mask] of h.seen) seen.set(id, (seen.get(id) ?? 0) | mask);
    }
  }
  const steps = Object.fromEntries(STEPS.map((step, i) => [step, [...seen.values()].filter((m) => m & (1 << i)).length])) as Record<(typeof STEPS)[number], number>;
  return { period, from: new Date(Math.max(first * HOUR, await begun(dir, first))).toISOString(), to: new Date(now).toISOString(), views, bots, visitors: steps.view, steps };
}

/** When the hours begin (ms): the first hour with traffic of the oldest day kept, or now if there is none; before `first` if the oldest day is. */
async function begun(dir: string | null, first: number) {
  const days = (await (dir ? fs.readdir(dir) : Promise.resolve([])).catch(() => [] as string[])).flatMap((n) => /^hours-(\d{4}-\d\d-\d\d)\.json$/.exec(n)?.[1] ?? []).sort();
  if (!days.length) return Date.now();
  const day = Date.parse(days[0]) / 864e5;
  if (day * 24 <= first) return 0;
  return (day * 24 + Math.min(...(await readHours(dir!, days[0])).keys())) * HOUR;
}
