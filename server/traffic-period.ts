import fs from 'node:fs/promises';
import { dayName, dayOfFile, HOUR, iso } from './days';
import { answer, type Period, type Span } from './stats-period';
import { bump } from './tally';
import { STEPS } from './traffic-count';
import { keptHours } from './traffic-store';

// GET /stats/traffic?period=P (server/admin/stats.ts): the web traffic over the same hours as the other stats, from the
// reader's hours files (traffic-store.ts). Each visitor counts once over the period, at each step they got to.

/** The traffic of `f`: views, bots, visitors, the visitors at each step and by the country of their first view in it; with `hours`, each hour's views and visitors too. `dir`: DATA_DIR/traffic (none: no traffic). */
export async function figures(dir: string | null, f: Span, hours = false) {
  const seen = new Map<string, number>();
  const from = new Map<string, string>();
  const each = new Map<number, { views: number; visitors: number }>();
  let [views, bots] = [0, 0];
  for (let day = Math.floor(f.first / 24); day <= Math.floor((f.end - 1) / 24); day++) {
    for (const [k, h] of dir ? await keptHours(dir, dayName(day)) : []) {
      const at = day * 24 + k;
      if (at < f.first || at >= f.end) continue;
      views += h.views;
      bots += h.bots;
      for (const [id, mask] of h.seen) seen.set(id, (seen.get(id) ?? 0) | mask);
      // The hours come oldest first: a visitor's first country stays.
      for (const [id, c] of h.countries) if (!from.has(id)) from.set(id, c);
      if (hours) each.set(at, { views: h.views, visitors: [...h.seen.values()].filter((m) => m & 1).length });
    }
  }
  const steps = Object.fromEntries(STEPS.map((step, i) => [step, [...seen.values()].filter((m) => m & (1 << i)).length])) as Record<(typeof STEPS)[number], number>;
  const visitorCountries: Record<string, number> = {};
  for (const c of from.values()) bump(visitorCountries, c);
  const list = hours ? { hours: Array.from({ length: f.end - f.first }, (_, i) => ({ at: iso((f.first + i) * HOUR), ...(each.get(f.first + i) ?? { views: 0, visitors: 0 }) })) } : {};
  return { views, bots, visitors: steps.view, steps, visitorCountries, ...list };
}

/** The traffic in `period` at `now`, as GET /stats/traffic answers it. `dir`: DATA_DIR/traffic. */
export const trafficPeriod = async (dir: string | null, period: Period, now = Date.now()) =>
  answer(period, now, await begun(dir, now), (f) => figures(dir, f, !f.before && (period === 'today' || period === '24h')));

/** When the hours begin (ms): the first hour with traffic of the oldest day kept, or now if there is none. */
async function begun(dir: string | null, now: number) {
  const days = (await (dir ? fs.readdir(dir) : Promise.resolve([])).catch(() => [] as string[])).flatMap((n) => dayOfFile(n, 'hours-', '.json') ?? []).sort((a, b) => a - b);
  for (const day of days) {
    const first = Math.min(...(await keptHours(dir!, dayName(day))).keys());
    if (Number.isFinite(first)) return day * 24 * HOUR + first * HOUR;
  }
  return now;
}
