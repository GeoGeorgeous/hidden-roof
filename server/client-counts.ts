import { SERVER } from '../src/config';

// What an hour's beacons add up to (beacon.ts adds, history.ts keeps and reports): counts, never a person.

type Counts = Record<string, number>;

/** An hour's beacons: plays (page loads), by GPU, browser and OS; frame rates, load and join times as histograms (fps by whole frames, times by tenths of a second); errors by message; the game's events. */
export interface ClientCounts {
  n: number;
  nGpu: number;
  browsers: Counts;
  os: Counts;
  gpus: Counts;
  fps: Counts;
  low1: Counts;
  load: Counts;
  join: Counts;
  errors: number;
  erred: number;
  messages: Counts;
  events: {
    /** Page loads that reached each funnel step. */
    steps: Counts;
    /** Page loads that reached each tutorial step. */
    tutorial: Counts;
    /** Events by code. */
    counts: Counts;
    /** Seconds in tenths: playing, idle, menu. */
    seconds: Counts;
    /** Page loads by the value each setting had at load. */
    settings: Record<string, Counts>;
  };
}

export const noClient = (): ClientCounts => ({
  n: 0, nGpu: 0, browsers: {}, os: {}, gpus: {}, fps: {}, low1: {}, load: {}, join: {}, errors: 0, erred: 0, messages: {},
  events: { steps: {}, tutorial: {}, counts: {}, seconds: {}, settings: {} },
});

/** `key` in `to`, or Other past SERVER.beaconKinds keys (`capped`: names, not a histogram's bins). */
const slot = (to: object, key: string, capped = true) => (!capped || Object.hasOwn(to, key) || Object.keys(to).length < SERVER.beaconKinds ? key : 'Other');

/** `key` counted in `to`. */
export function count(to: Counts, key: string, n = 1, capped = true) {
  const k = slot(to, key, capped);
  to[k] = (Object.hasOwn(to, k) ? to[k] : 0) + n;
}

/** `from`'s counts added to `to`'s; past SERVER.beaconKinds names the smallest go to Other, whichever hour they came from (`capped`: names, not a histogram's bins). */
function merge(to: Counts, from: Counts, capped = true) {
  for (const [key, n] of Object.entries(from)) to[key] = (Object.hasOwn(to, key) ? to[key] : 0) + n;
  if (capped) trim(to, (n) => n, (other, n) => (other ?? 0) + n);
}

/** The keys of `to` past SERVER.beaconKinds, the lightest first to go, folded into Other by `fold`. */
function trim<T>(to: Record<string, T>, weight: (v: T) => number, fold: (other: T | undefined, v: T) => T) {
  const names = Object.keys(to).filter((k) => k !== 'Other');
  if (names.length <= SERVER.beaconKinds) return;
  names.sort((a, b) => weight(to[b]) - weight(to[a]));
  for (const k of names.slice(SERVER.beaconKinds)) {
    to.Other = fold(Object.hasOwn(to, 'Other') ? to.Other : undefined, to[k]);
    delete to[k];
  }
}

export function addClient(to: ClientCounts, from: ClientCounts) {
  to.n += from.n;
  to.nGpu += from.nGpu;
  to.errors += from.errors;
  to.erred += from.erred;
  for (const k of ['browsers', 'os', 'gpus', 'messages'] as const) merge(to[k], from[k]);
  for (const k of ['fps', 'low1', 'load', 'join'] as const) merge(to[k], from[k], false);
  for (const k of ['steps', 'seconds'] as const) merge(to.events[k], from.events[k], false);
  for (const k of ['tutorial', 'counts'] as const) merge(to.events[k], from.events[k]);
  const [mine, theirs] = [to.events.settings, from.events.settings];
  for (const [key, values] of Object.entries(theirs)) merge((mine[key] = Object.hasOwn(mine, key) ? mine[key] : {}), values);
  trim(mine, (v) => Object.values(v).reduce((s, n) => s + n, 0), (other, v) => {
    merge((other ??= {}), v);
    return other;
  });
}

/** `n` page loads with `key` set to `value`; Other past SERVER.beaconKinds settings, and per setting past as many values. */
export function countSetting(c: ClientCounts, key: string, value: string, n = 1) {
  const to = c.events.settings;
  const k = slot(to, key);
  count((to[k] = Object.hasOwn(to, k) ? to[k] : {}), value, n);
}

/** The value below which `share` of a histogram's counts are, or null if it's empty. */
function quantile(h: Counts, share: number, scale: number) {
  const bins = Object.entries(h).map(([k, n]) => [Number(k), n] as const).sort((a, b) => a[0] - b[0]);
  const all = bins.reduce((s, [, n]) => s + n, 0);
  let past = 0;
  for (const [k, n] of bins) if ((past += n) >= all * share) return k / scale;
  return null;
}

/** A histogram's bins in tenths as seconds. */
const inSeconds = (h: Counts) => Object.fromEntries(Object.entries(h).map(([k, n]) => [String(Number(k) / 10), n]));

/** As /history answers it. */
export function clientReport(c: ClientCounts) {
  const { steps, tutorial, counts, seconds, settings } = c.events;
  return {
    n: c.n,
    nGpu: c.nGpu,
    fps: { median: quantile(c.fps, 0.5, 1), low1: quantile(c.low1, 0.5, 1), hist: c.fps, low1Hist: c.low1 },
    load: { median: quantile(c.load, 0.5, 10), p95: quantile(c.load, 0.95, 10), hist: inSeconds(c.load) },
    join: { median: quantile(c.join, 0.5, 10), p95: quantile(c.join, 0.95, 10), hist: inSeconds(c.join) },
    browsers: c.browsers,
    os: c.os,
    gpus: c.gpus,
    errors: { count: c.errors, plays: c.erred, byMessage: c.messages },
    events: {
      steps: { play: steps.play ?? 0, ready: steps.ready ?? 0, sprayed: steps.sprayed ?? 0, joined: steps.joined ?? 0 },
      tutorial,
      counts,
      seconds: { playing: (seconds.playing ?? 0) / 10, idle: (seconds.idle ?? 0) / 10, menu: (seconds.menu ?? 0) / 10 },
      settings,
    },
  };
}
