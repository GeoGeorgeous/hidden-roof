import { people } from './people';
import type { Row } from './people-count';
import { dayName } from './days';

// GET /stats/people/days (docs/admin-api.md, History): each day's row as kept (audience.ts), and the devices over the range, each counted once.

/** `range`: days since 1970, both included; `now`: ms. */
export async function peopleDays(range: { from: number; to: number }, now: number) {
  const rows = await people.rows(range.from, range.to, now);
  let [known, unknown, unmatched, fresh] = [0, 0, 0, 0];
  // A device counts on the one day that its play before is older than the range: its gap is past the day's distance from `from`.
  const past = (gaps: Record<string, number>, d: number) => Object.entries(gaps).reduce((n, [gap, devices]) => n + (+gap > d - range.from ? devices : 0), 0);
  for (const [d, row] of rows) {
    known += past(row.gaps, d) + row.gapsNone;
    unknown += past(row.unknownGaps, d) + row.unknownGapsNone + row.unmatched;
    unmatched += row.unmatched;
    fresh += row.ages['0'] ?? 0;
  }
  const days = [...rows].map(([d, row]: [number, Row]) => ({ day: dayName(d), ...row }));
  return {
    from: dayName(range.from),
    to: dayName(range.to),
    players: known + unknown,
    newPlayers: fresh,
    returningPlayers: known - fresh,
    unknownPlayers: unknown,
    unmatched,
    days,
  };
}
