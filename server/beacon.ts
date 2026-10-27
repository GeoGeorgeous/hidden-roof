import { randomUUID } from 'node:crypto';
import type http from 'node:http';
import { SERVER } from '../src/config';
import { BEATS, check } from './beacon-body';
import { count, countSetting, noNet, type ClientCounts } from './client-counts';
import { countryOf } from './geoip';
import { people } from './people';

// The game's beacon (src/beacon.ts) at POST /ws?e: checked (beacon-body.ts), limited in size
// (SERVER.beaconBytes) and per address (SERVER.beaconsPerIp a minute, from SERVER.beaconIps addresses), and
// added to the hour's counts (client-counts.ts, history.ts). Only the counts are kept: the
// address is used for the limit, the User-Agent for the browser and OS. The pages open now are kept
// by their random id, in memory, only as long as they beat (SERVER.beaconSiteSeconds).

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

type Beat = (typeof BEATS)[number];
/** Each open page by its id: what its last beat said and when, the oldest beat first (a page that beats again moves to the end). A beacon without an id (an older game) is a page of its own each time. */
const pages = new Map<string, { beat: Beat; at: number }>();
const open = Object.fromEntries(BEATS.map((k) => [k, 0])) as Record<Beat, number>;

function leave(id: string) {
  const p = pages.get(id);
  if (p) (open[p.beat]--, pages.delete(id));
}

/** Pages whose last beat is older than SERVER.beaconSiteSeconds are gone. */
function expire(now: number) {
  for (const [id, p] of pages) {
    if (p.at > now - SERVER.beaconSiteSeconds * 1000) break;
    leave(id);
  }
}

/** Who is on the site now: the pages that beat in the last SERVER.beaconSiteSeconds, each once, by what its last beat said (the game's beat or goodbye, beacon-body.ts). */
export function site() {
  expire(Date.now());
  return { ...open };
}

/** When the last beacon came in (ms), or null since the server started. */
let last: number | null = null;
export const lastBeacon = () => last;

/** Beacons this minute, by address: at most SERVER.beaconIps addresses, so a flood of them can't grow it. */
let sent = new Map<string, number>();
setInterval(() => (sent = new Map()), 60e3).unref();

/** POST /ws?e from `ip`, counted into `into()`: the status to answer. */
export async function beacon(req: http.IncomingMessage, ip: string, into: () => ClientCounts) {
  const n = (sent.get(ip) ?? 0) + 1;
  if (n === 1 && sent.size >= SERVER.beaconIps) return 429;
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
  last = Date.now();
  if (b.bye && b.page) leave(b.page);
  else if (b.beat) {
    const now = Date.now();
    expire(now);
    const id = b.page ?? randomUUID();
    leave(id);
    while (pages.size >= SERVER.beaconPages) leave(pages.keys().next().value!);
    pages.set(id, { beat: b.beat, at: now });
    open[b.beat]++;
  }
  const c = into();
  const ua = String(req.headers['user-agent'] ?? '');
  if (b.first) {
    people.played(b.first.device, ip, countryOf(ip), 'page');
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
  if (b.net) {
    // An hour kept before 1.6.0's network counts has none yet.
    const [n, m] = [(c.net ??= noNet()), b.net];
    n.seconds += Math.round(m.seconds * 10);
    const ms = (x: number) => String(Math.round(x / 10) * 10);
    if (m.ping) (count(n.ping50, ms(m.ping.p50), 1, false), count(n.ping95, ms(m.ping.p95), 1, false), count(n.pingMax, ms(m.ping.max), 1, false));
    for (const [code, k] of Object.entries(m.drops ?? {})) count(n.drops, code, k);
    for (const s of m.back ?? []) count(n.back, String(Math.round(s * 10)), 1, false);
    n.stalls += m.stalls ?? 0;
    for (const s of m.stallLong ?? []) count(n.stallLong, String(Math.round(s * 10)), 1, false);
    count(n.down, String(m.down), 1, false);
    count(n.up, String(m.up), 1, false);
  }
  return 204;
}
