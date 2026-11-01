import { dayAt, dayName, DAY, dayOf, HOUR, hourAt, iso, todaySpan } from './days';
import { Refused } from './refused';

// The period every /stats route answers over (docs/admin-api.md, Stats): hours since 1970, the period just before it, and
// the shape of the answer. Each route gives one function that makes its figures from a range, and it is called for the
// period and for the one before, so the two can't drift.

export type Period = 'today' | '24h' | '7d' | '30d';
const HOURS: Record<Exclude<Period, 'today'>, number> = { '24h': 24, '7d': 7 * 24, '30d': 30 * 24 };
const isPeriod = (p: string): p is Period => p === 'today' || Object.hasOwn(HOURS, p);

/** The hours from `first` up to `end` (hours since 1970): the last of them is `end - 1`. */
export interface Span {
  first: number;
  end: number;
}

/** A span with the time it covers in ms: `from` is its start, or when the counts begin if that's later, `to` its end, or now if that's sooner. `before`: it is the period before. */
export interface Frame extends Span {
  from: number;
  to: number;
  before: boolean;
}

/** `?period=`: today, 24h, 7d or 30d (24h if none); anything else is a 400. */
export function periodOf(q: URLSearchParams) {
  const p = q.get('period') ?? '24h';
  if (!isPeriod(p)) throw new Refused('period: today, 24h, 7d or 30d');
  return p;
}

/** The hours of `period` at `now` (ms), this one included, and those of the period before: today since 00:00 UTC against yesterday from 00:00 through the same hour, the others against the same length just before. */
export function spans(period: Period, now: number): [Span, Span] {
  if (period === 'today') {
    const t = todaySpan(now);
    return [t, { first: t.first - 24, end: t.end - 24 }];
  }
  const end = hourAt(now) + 1;
  const n = HOURS[period];
  return [{ first: end - n, end }, { first: end - 2 * n, end: end - n }];
}

/** Each UTC day `s` touches, oldest first, with its hours cut to `s` (the first and last may be partial). */
export function daysIn(s: Span) {
  const days: (Span & { day: string })[] = [];
  for (let d = Math.floor(s.first / 24); d <= Math.floor((s.end - 1) / 24); d++) days.push({ day: dayName(d), first: Math.max(s.first, d * 24), end: Math.min(s.end, d * 24 + 24) });
  return days;
}

/** Monday first: 0 for a Monday (1 January 1970 was a Thursday), of the day since 1970 that hour `k` is in. */
export const weekdayOf = (k: number) => (Math.floor(k / 24) + 3) % 7;

/**
 * The answer for `period` at `now`: `figures` of its frame and of the frame before, and `perDay` of each of its days if given.
 * `begin`: when the counts begin (ms): the period starts there if later, and the period before is null if it ended before.
 */
export async function answer<F extends object, D extends object>(period: Period, now: number, begin: number, figures: (f: Frame) => F | Promise<F>, perDay?: (s: Span) => D | Promise<D>) {
  const [main, prev] = spans(period, now);
  const frame = (s: Span, before: boolean): Frame => ({ ...s, from: Math.max(s.first * HOUR, begin), to: Math.min(s.end * HOUR, now), before });
  const [current, then] = [frame(main, false), frame(prev, true)];
  const here = await figures(current);
  const days = perDay ? { days: await Promise.all(daysIn(main).map(async (d) => ({ day: d.day, ...(await perDay(d)) }))) } : {};
  const before = prev.end * HOUR <= begin ? null : { from: iso(then.from), to: iso(then.to), ...(await figures(then)) };
  return { period, from: iso(current.from), to: iso(now), ...here, ...days, before };
}

const MONTH_RE = /^(\d{4})-(\d\d)$/;
/** `s` as months since 1970 (YYYY-MM, 1970 on), or null. */
function monthOf(s: string) {
  const m = MONTH_RE.exec(s);
  return m && +m[1] >= 1970 && +m[2] >= 1 && +m[2] <= 12 ? (+m[1] - 1970) * 12 + +m[2] - 1 : null;
}
/** `month` (months since 1970) as YYYY-MM; none before 1970. */
export const monthName = (month: number) => {
  const m = Math.max(0, month);
  return `${1970 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`;
};
/** The month (since 1970) of `day` (days since 1970). */
export const monthOfDay = (day: number) => {
  const d = new Date(day * DAY);
  return (d.getUTCFullYear() - 1970) * 12 + d.getUTCMonth();
};
/** The first day (since 1970) of `month` (months since 1970). */
export const monthStart = (month: number) => Date.UTC(1970 + Math.floor(month / 12), month % 12, 1) / DAY;

/** A History route's days (docs/admin-api.md, History): `?from=&to=` as days since 1970, both included; `most` days at most. Throws Refused (400). */
export function dayRange(q: URLSearchParams, now: number, most: number) {
  const to = q.has('to') ? dayOf(q.get('to')!) : dayAt(now);
  if (to === null) throw new Refused('to: YYYY-MM-DD');
  const from = q.has('from') ? dayOf(q.get('from')!) : Math.max(0, to - 29);
  if (from === null) throw new Refused('from: YYYY-MM-DD');
  if (from > to || to - from + 1 > most) throw new Refused(`from to to: 1 to ${most} days`);
  return { from, to };
}

/** A History route's months (`?from=YYYY-MM&to=YYYY-MM`) as months since 1970, both included; `most` months at most. Throws Refused (400). */
export function monthRange(q: URLSearchParams, now: number, most: number) {
  const to = q.has('to') ? monthOf(q.get('to')!) : monthOfDay(dayAt(now));
  if (to === null) throw new Refused('to: YYYY-MM');
  const from = q.has('from') ? monthOf(q.get('from')!) : Math.max(0, to - 11);
  if (from === null) throw new Refused('from: YYYY-MM');
  if (from > to || to - from + 1 > most) throw new Refused(`from to to: 1 to ${most} months`);
  return { from, to };
}
