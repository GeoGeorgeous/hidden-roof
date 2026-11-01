import { join } from 'node:path';
import { history } from '../history';
import { people } from '../people';
import { Missing, Refused } from '../refused';
import { client, paint, paintDay, play, playDay } from '../stats-hours';
import { answer, periodOf, type Frame, type Span } from '../stats-period';
import { trafficPeriod } from '../traffic-period';
import { SERVER } from '../../src/config';
import { dayAt } from '../days';
import { historyDays } from '../history-days';
import { peopleDays } from '../people-days';
import { dayRange, monthRange } from '../stats-period';
import { trafficMonths } from '../traffic-months';
import { trafficDays } from '../traffic-store';
import { upTo } from './route';

// GET /stats/* (docs/admin-api.md, Stats): the figures of a period and of the one before, by group.

/** `path`: the route past /stats (['play'], ['traffic', 'days'], ...); `q`: its query; `dir`: DATA_DIR or null. Throws Refused (400) for a bad query, Missing (404) for no such route. */
export async function statsRoute(path: string[], q: URLSearchParams, dir: string | null): Promise<unknown> {
  const [group, more, ...rest] = path;
  if (more !== undefined && !rest.length) return historyRoute(group, more, q, dir);
  if (path.length !== 1 || !['play', 'people', 'paint', 'client', 'traffic'].includes(group)) throw new Missing('not found');
  const [period, now] = [periodOf(q), Date.now()];
  /** The history's figures over the period, and per day if given. */
  const over = <F extends object, D extends object>(figures: (f: Frame) => F, perDay?: (s: Span) => D) => answer(period, now, history.begin, figures, perDay);
  switch (group) {
    case 'play':
      return over(play, playDay);
    case 'people':
      return over((f) => people.count(f.first, f.end), (s) => people.day(s.first, s.end));
    case 'paint':
      return over(paint, paintDay);
    case 'client':
      return over((f) => client(f));
    default:
      return trafficPeriod(dir && join(dir, 'traffic'), period, now);
  }
}

/** The History routes (docs/admin-api.md, History): a group's days, or the site's months. */
async function historyRoute(group: string, more: string, q: URLSearchParams, dir: string | null) {
  const now = Date.now();
  const traffic = dir && join(dir, 'traffic');
  if (more === 'months' && group === 'traffic') return trafficMonths(traffic, monthRange(q, now, SERVER.statsMonthsMost), now);
  if (more !== 'days') throw new Missing('not found');
  if (group === 'traffic' && q.has('n')) {
    const n = q.get('n')!;
    if (!upTo(n, SERVER.statsDaysMost)) throw new Refused(`n: 1 to ${SERVER.statsDaysMost}`);
    const to = dayAt(now);
    return trafficDays(traffic, { from: to - +n + 1, to });
  }
  const range = dayRange(q, now, SERVER.statsDaysMost);
  switch (group) {
    case 'play':
    case 'paint':
      return historyDays(group, range, dir);
    case 'people':
      return peopleDays(range, now);
    case 'traffic':
      return trafficDays(traffic, range);
    default:
      throw new Missing('not found');
  }
}
