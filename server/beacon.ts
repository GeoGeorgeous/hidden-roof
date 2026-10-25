import type http from 'node:http';
import { NET, SERVER } from '../src/config';

// The game's beacon (src/beacon.ts) at POST /ws?e: checked, limited in size
// (SERVER.beaconBytes) and per address (SERVER.beaconsPerIp a minute), and
// added to the hour's counts (history.ts). Only the counts are kept: the
// address is used for the limit, the User-Agent for the browser and OS.

type Counts = Record<string, number>;

/** An hour's beacons: plays (page loads), by GPU, browser and OS; frame rates, load and join times as histograms (fps by whole frames, times by tenths of a second); errors by message. */
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
}

export const noClient = (): ClientCounts => ({ n: 0, nGpu: 0, browsers: {}, os: {}, gpus: {}, fps: {}, low1: {}, load: {}, join: {}, errors: 0, erred: 0, messages: {} });

/** `key` counted in `to`; past SERVER.beaconKinds keys a new name is Other (`capped`: names, not a histogram's bins). */
function count(to: Counts, key: string, n = 1, capped = true) {
  const k = !capped || key in to || Object.keys(to).length < SERVER.beaconKinds ? key : 'Other';
  to[k] = (to[k] ?? 0) + n;
}

export function addClient(to: ClientCounts, from: ClientCounts) {
  to.n += from.n;
  to.nGpu += from.nGpu;
  to.errors += from.errors;
  to.erred += from.erred;
  for (const k of ['browsers', 'os', 'gpus', 'messages'] as const) for (const [key, n] of Object.entries(from[k])) count(to[k], key, n);
  for (const k of ['fps', 'low1', 'load', 'join'] as const) for (const [key, n] of Object.entries(from[k])) count(to[k], key, n, false);
}

/** The value below which `share` of a histogram's counts are, or null if it's empty. */
function quantile(h: Counts, share: number, scale: number) {
  const bins = Object.entries(h).map(([k, n]) => [Number(k), n] as const).sort((a, b) => a[0] - b[0]);
  const all = bins.reduce((s, [, n]) => s + n, 0);
  let past = 0;
  for (const [k, n] of bins) if ((past += n) >= all * share) return k / scale;
  return null;
}

const top = (c: Counts, n: number) => Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n);

/** As /history answers it. */
export function clientReport(c: ClientCounts) {
  return {
    n: c.n,
    nGpu: c.nGpu,
    fps: { median: quantile(c.fps, 0.5, 1), low1: quantile(c.low1, 0.5, 1) },
    load: { median: quantile(c.load, 0.5, 10), p95: quantile(c.load, 0.95, 10) },
    join: { median: quantile(c.join, 0.5, 10), p95: quantile(c.join, 0.95, 10) },
    browsers: c.browsers,
    os: c.os,
    gpus: c.gpus,
    errors: { count: c.errors, plays: c.erred, top: top(c.messages, SERVER.beaconTopErrors).map(([message, count]) => ({ message, count })) },
  };
}

function browserOf(ua: string) {
  if (/\bEdg\//.test(ua)) return 'Edge';
  if (/\b(OPR|Opera)\//.test(ua)) return 'Opera';
  if (/\bFirefox\//.test(ua)) return 'Firefox';
  if (/\b(Chrome|CriOS)\//.test(ua)) return 'Chrome';
  if (/\bSafari\//.test(ua)) return 'Safari';
  return 'Other';
}

function osOf(ua: string) {
  if (/Windows/.test(ua)) return 'Windows';
  if (/Android/.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Other';
}

const isNum = (x: unknown, most: number) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= most;
const isList = (x: unknown, ok: (v: unknown) => boolean) => x === undefined || (Array.isArray(x) && x.length <= NET.beaconList && x.every(ok));

/** A beacon's body as the game sends it, or null. */
function check(b: unknown) {
  if (typeof b !== 'object' || !b) return null;
  const { first, fps, joins, errors, erred } = b as Record<string, unknown>;
  const f = first as { gpu?: unknown; load?: unknown } | undefined;
  const r = fps as { avg?: unknown; low1?: unknown } | undefined;
  if (f !== undefined && (typeof f !== 'object' || !f || !(f.gpu === null || (typeof f.gpu === 'string' && f.gpu.length <= SERVER.beaconText)) || !isNum(f.load, SERVER.beaconMostSeconds))) return null;
  if (r !== undefined && (typeof r !== 'object' || !r || !isNum(r.avg, 1000) || !isNum(r.low1, 1000))) return null;
  if (!isList(joins, (j) => isNum(j, SERVER.beaconMostSeconds)) || !isList(errors, (e) => typeof e === 'string' && e.length <= NET.beaconErrorChars)) return null;
  if (erred !== undefined && erred !== true) return null;
  return { first: f as { gpu: string | null; load: number } | undefined, fps: r as { avg: number; low1: number } | undefined, joins: joins as number[] | undefined, errors: errors as string[] | undefined, erred };
}

/** Beacons this minute, by address. */
let sent = new Map<string, number>();
setInterval(() => (sent = new Map()), 60e3).unref();

/** POST /ws?e from `ip`, counted into `into()`: the status to answer. */
export async function beacon(req: http.IncomingMessage, ip: string, into: () => ClientCounts) {
  const n = (sent.get(ip) ?? 0) + 1;
  sent.set(ip, n);
  if (n > SERVER.beaconsPerIp) return 429;
  let text = '';
  for await (const chunk of req) if ((text += chunk).length > SERVER.beaconBytes) return 413;
  let b;
  try {
    b = check(JSON.parse(text));
  } catch {
    b = null;
  }
  if (!b) return 400;
  const c = into();
  const ua = String(req.headers['user-agent'] ?? '');
  if (b.first) {
    c.n++;
    count(c.browsers, browserOf(ua));
    count(c.os, osOf(ua));
    count(c.load, String(Math.round(b.first.load * 10)), 1, false);
    if (b.first.gpu) (c.nGpu++, count(c.gpus, b.first.gpu));
  }
  if (b.fps) (count(c.fps, String(Math.round(b.fps.avg)), 1, false), count(c.low1, String(Math.round(b.fps.low1)), 1, false));
  for (const j of b.joins ?? []) count(c.join, String(Math.round(j * 10)), 1, false);
  for (const e of b.errors ?? []) (c.errors++, count(c.messages, e));
  if (b.erred) c.erred++;
  return 204;
}
