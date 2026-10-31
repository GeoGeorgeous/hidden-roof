import fs from 'node:fs/promises';
import { answer, dayName, HOUR, iso, type Frame, type Period } from './stats-period';
import { STEPS } from './traffic-count';
import { readHours } from './traffic-store';

// GET /stats/traffic?period=P (server/admin/stats.ts): the web traffic over the same hours as the other stats, from the
// reader's hours files (traffic-store.ts). Each visitor counts once over the period, at each step they got to.

/** The traffic of `f`: views, bots, visitors, and the visitors at each step; with `hours`, each hour's views and visitors too. `dir`: DATA_DIR/traffic (none: no traffic). */
async function figures(dir: string | null, f: Frame, hours: boolean) {
  const seen = new Map<string, number>();
  const each = new Map<number, { views: number; visitors: number }>();
  let [views, bots] = [0, 0];
  for (let day = Math.floor(f.first / 24); day <= Math.floor((f.end - 1) / 24); day++) {
    for (const [k, h] of dir ? await readHours(dir, dayName(day)) : []) {
      const at = day * 24 + k;
      if (at < f.first || at >= f.end) continue;
      views += h.views;
      bots += h.bots;
      for (const [id, mask] of h.seen) seen.set(id, (seen.get(id) ?? 0) | mask);
      each.set(at, { views: h.views, visitors: [...h.seen.values()].filter((m) => m & 1).length });
    }
  }
  const steps = Object.fromEntries(STEPS.map((step, i) => [step, [...seen.values()].filter((m) => m & (1 << i)).length])) as Record<(typeof STEPS)[number], number>;
  const list = Array.from({ length: f.end - f.first }, (_, i) => ({ at: iso((f.first + i) * HOUR), ...(each.get(f.first + i) ?? { views: 0, visitors: 0 }) }));
  return { views, bots, visitors: steps.view, steps, ...(hours ? { hours: list } : {}) };
}

/** The traffic in `period` at `now`, as GET /stats/traffic answers it. `dir`: DATA_DIR/traffic. */
export const trafficPeriod = async (dir: string | null, period: Period, now = Date.now()) =>
  answer(period, now, await begun(dir, now), (f) => figures(dir, f, !f.before && (period === 'today' || period === '24h')));

/** When the hours begin (ms): the first hour with traffic of the oldest day kept, or now if there is none. */
async function begun(dir: string | null, now: number) {
  const days = (await (dir ? fs.readdir(dir) : Promise.resolve([])).catch(() => [] as string[])).flatMap((n) => /^hours-(\d{4}-\d\d-\d\d)\.json$/.exec(n)?.[1] ?? []).sort();
  for (const day of days) {
    const first = Math.min(...(await readHours(dir!, day)).keys());
    if (Number.isFinite(first)) return Date.parse(day) + first * HOUR;
  }
  return now;
}
