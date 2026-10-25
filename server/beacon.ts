import type http from 'node:http';
import { NET, SERVER } from '../src/config';
import { BEATS, check } from './beacon-body';
import { count, countSetting, type ClientCounts } from './client-counts';

// The game's beacon (src/beacon.ts) at POST /ws?e: checked (beacon-body.ts), limited in size
// (SERVER.beaconBytes) and per address (SERVER.beaconsPerIp a minute), and
// added to the hour's counts (client-counts.ts, history.ts). Only the counts are kept: the
// address is used for the limit, the User-Agent for the browser and OS.

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

/** When the beacons of each `beat` came in the last NET.beaconEvery s: pages open by what they're doing. */
const beats = Object.fromEntries(BEATS.map((k) => [k, [] as number[]])) as Record<(typeof BEATS)[number], number[]>;
const recent = (at: number[], now = Date.now()) => {
  while (at.length && at[0] <= now - NET.beaconEvery * 1000) at.shift();
  return at.length;
};

/** Who is on the site now: the pages that sent a beacon in the last NET.beaconEvery s, by what they're doing. */
export const site = () => Object.fromEntries(BEATS.map((k) => [k, recent(beats[k])])) as Record<(typeof BEATS)[number], number>;

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
  if (b.beat) (recent(beats[b.beat]), beats[b.beat].push(Date.now()));
  const c = into();
  const ua = String(req.headers['user-agent'] ?? '');
  if (b.first) {
    c.n++;
    count(c.browsers, browserOf(ua));
    count(c.os, osOf(ua));
    count(c.load, String(Math.round(b.first.load * 10)), 1, false);
    if (b.first.gpu) (c.nGpu++, count(c.gpus, b.first.gpu));
    for (const [key, value] of Object.entries(b.first.settings ?? {})) countSetting(c, key, value);
  }
  if (b.fps) (count(c.fps, String(Math.round(b.fps.avg)), 1, false), count(c.low1, String(Math.round(b.fps.low1)), 1, false));
  for (const j of b.joins ?? []) count(c.join, String(Math.round(j * 10)), 1, false);
  for (const e of b.errors ?? []) (c.errors++, count(c.messages, e));
  if (b.erred) c.erred++;
  const e = c.events;
  for (const step of new Set(b.steps)) count(e.steps, step, 1, false);
  for (const step of new Set(b.tutorial)) count(e.tutorial, step);
  for (const [code, n] of Object.entries(b.counts ?? {})) count(e.counts, code, n);
  for (const [kind, s] of Object.entries(b.seconds ?? {})) count(e.seconds, kind, Math.round(s * 10), false);
  return 204;
}
