import { COLOR_ORDER } from '../src/config';
import { clientReport } from './client-counts';
import { history, sum } from './history';
import { HOUR } from './days';
import { daysIn, weekdayOf, type Frame, type Span } from './stats-period';

// What the history's hours (history.ts) add up to over a range: the figures of GET /stats/play, /paint and /client.

const grid = () => Array.from({ length: 7 }, () => Array<number>(24).fill(0));
const totals = (s: Span) => sum(history.within(s).map(([, h]) => h));

/** The play in `f`: plays and their lengths, play time, and the week by weekday (Monday first) and hour, UTC. */
export function play(f: Frame) {
  const t = totals(f);
  const [joins, seconds, covered] = [grid(), grid(), grid()];
  for (const [k, h] of history.within(f)) {
    joins[weekdayOf(k)][k % 24] += h.plays;
    seconds[weekdayOf(k)][k % 24] += h.seconds;
  }
  // The seconds of each weekday-hour that the range has (the first and the last hours may be partial).
  for (let k = f.first; k < f.end; k++) covered[weekdayOf(k)][k % 24] += Math.max(0, Math.min((k + 1) * HOUR, f.to) - Math.max(k * HOUR, f.from)) / 1000;
  const weekdays = Array<number>(7).fill(0);
  for (const d of daysIn(f)) weekdays[weekdayOf(d.first)]++;
  return {
    plays: t.plays, lengthMinutes: t.minutes, playSeconds: Math.round(t.seconds), withOthers: Math.round(t.withOthers),
    joinsByWeekHour: joins,
    onlineByWeekHour: seconds.map((row, wd) => row.map((s, h) => (covered[wd][h] ? Math.round((s / covered[wd][h]) * 1000) / 1000 : 0))),
    weekdays, turnedAway: t.turnedAway, peak: t.peak,
  };
}

/** A day of play: its plays and play seconds. */
export function playDay(s: Span) {
  const t = totals(s);
  return { plays: t.plays, playSeconds: Math.round(t.seconds) };
}

/** The paint in `s`: stamps by tool, ops by color (in the game's order, those with none left out). */
export function paint(s: Span) {
  const t = totals(s);
  return { stamps: t.stamps, colors: Object.fromEntries(COLOR_ORDER.flatMap((c) => (t.colors[c] ? [[c, t.colors[c]]] : []))) };
}

/** A day of paint: its stamps. */
export const paintDay = (s: Span) => ({ stamps: totals(s).stamps });

/** The games' beacons in `s`. */
export const client = (s: Span) => clientReport(totals(s).client);
