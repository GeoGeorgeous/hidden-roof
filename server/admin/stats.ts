import { join } from 'node:path';
import { history } from '../history';
import { people } from '../people';
import { Missing, Refused } from '../refused';
import { client, paint, paintDay, play, playDay } from '../stats-hours';
import { answer, periodOf, type Frame, type Span } from '../stats-period';
import { trafficPeriod } from '../traffic-period';
import { trafficDays } from '../traffic-store';
import { upTo } from './route';

// GET /stats/* (docs/admin-api.md, Stats): the figures of a period and of the one before, by group.

/** `path`: the route past /stats (['play'], ['traffic', 'days'], ...); `q`: its query; `dir`: DATA_DIR or null. Throws Refused (400) for a bad query, Missing (404) for no such route. */
export async function statsRoute(path: string[], q: URLSearchParams, dir: string | null): Promise<unknown> {
  const [group, more, ...rest] = path;
  if (group === 'traffic' && more === 'days' && !rest.length) {
    const n = q.get('n') ?? '30';
    if (!upTo(n, 366)) throw new Refused('n: 1 to 366');
    return dir ? trafficDays(dir, +n) : { days: [] };
  }
  if (more !== undefined || !['play', 'people', 'paint', 'client', 'traffic'].includes(group)) throw new Missing('not found');
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
