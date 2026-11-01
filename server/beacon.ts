import { randomUUID } from 'node:crypto';
import type http from 'node:http';
import { SERVER } from '../src/config';
import { BEATS, check, DOINGS } from './beacon-body';
import { bin, count, countSetting, type ClientCounts } from './client-counts';
import { countryOf } from './geoip';
import { people } from './people';
import { PerMinute } from './per-minute';

// The game's beacon (src/beacon.ts) at POST /ws?e: checked (beacon-body.ts), limited in size
// (SERVER.beaconBytes) and per address (SERVER.beaconsPerIp a minute, from SERVER.beaconIps addresses; an IPv6 one by its /64), and
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
type Doing = (typeof DOINGS)[number];
/** Each open page by its id: what its last beat said and when, the oldest beat first (a page that beats again moves to the end). `doing`: what it does, `session`: it is in a session. A beacon without an id (an older game) is a page of its own each time. */
const pages = new Map<string, { beat: Beat; doing: Doing; session: boolean; at: number }>();
const open = Object.fromEntries(BEATS.map((k) => [k, 0])) as Record<Beat, number>;
const noPlace = () => ({ session: 0, alone: 0 });
const by = Object.fromEntries(DOINGS.map((k) => [k, noPlace()])) as Record<Doing, ReturnType<typeof noPlace>>;

function leave(id: string) {
  const p = pages.get(id);
  if (p) (open[p.beat]--, by[p.doing][p.session ? 'session' : 'alone']--, pages.delete(id));
}

/** Pages whose last beat is older than SERVER.beaconSiteSeconds are gone. */
function expire(now: number) {
  for (const [id, p] of pages) {
    if (p.at > now - SERVER.beaconSiteSeconds * 1000) break;
    leave(id);
  }
}

/** Who is on the site now: the pages that beat in the last SERVER.beaconSiteSeconds, each once, by what its last beat said (the game's beat or goodbye, beacon-body.ts) and by what it does, in a session or alone. */
export function site() {
  expire(Date.now());
  return { ...open, by: Object.fromEntries(DOINGS.map((k) => [k, { ...by[k] }])) as typeof by };
}

/** When the last beacon came in (ms), or null since the server started. */
let last: number | null = null;
export const lastBeacon = () => last;

/** Beacons by address (its /64), SERVER.beaconsPerIp a minute from at most SERVER.beaconIps addresses, so a flood of them can't grow it. */
const sent = new PerMinute(() => SERVER.beaconsPerIp, () => SERVER.beaconIps);

/** POST /ws?e from `ip`, counted into `into()`: the status to answer. */
export async function beacon(req: http.IncomingMessage, ip: string, into: () => ClientCounts) {
  if (!sent.allow(ip)) return 429;
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
    // A hidden page doesn't say where it is: it stays where its last beat put it.
    const session = b.beat === 'session' || (b.beat === 'hidden' && pages.get(id)?.session === true);
    leave(id);
    while (pages.size >= SERVER.beaconPages) leave(pages.keys().next().value!);
    // An older game's beat has no `doing`: playing, unless it is in a menu or hidden.
    const doing = b.doing ?? (b.beat === 'menu' || b.beat === 'hidden' ? b.beat : 'playing');
    pages.set(id, { beat: b.beat, doing, session, at: now });
    open[b.beat]++;
    by[doing][session ? 'session' : 'alone']++;
  }
  const c = into();
  const ua = String(req.headers['user-agent'] ?? '');
  if (b.first) {
    people.played(b.first.device, ip, countryOf(ip), 'page', b.first.days);
    c.n++;
    count(c.browsers, browserOf(ua));
    count(c.os, osOf(ua));
    count(c.load, bin.tenth(b.first.load), 1, false);
    if (b.first.gpu) (c.nGpu++, count(c.gpus, b.first.gpu));
    for (const [key, value] of Object.entries(b.first.settings ?? {})) countSetting(c, key, value);
  }
  if (b.fps) (count(c.fps, bin.fps(b.fps.avg), 1, false), count(c.low1, bin.fps(b.fps.low1), 1, false));
  for (const j of b.joins ?? []) count(c.join, bin.tenth(j), 1, false);
  for (const e of b.errors ?? []) (c.errors++, count(c.messages, e));
  if (b.erred) c.erred++;
  const e = c.events;
  for (const step of new Set(b.steps)) count(e.steps, step, 1, false);
  for (const step of new Set(b.tutorial)) count(e.tutorial, step);
  for (const [code, n] of Object.entries(b.counts ?? {})) count(e.counts, code, n);
  for (const [kind, s] of Object.entries(b.seconds ?? {})) count(e.seconds, kind, Math.round(s * 10), false);
  if (b.net) {
    const [n, m] = [c.net, b.net];
    n.seconds += Math.round(m.seconds * 10);
    if (m.ping) (count(n.ping50, bin.tenMs(m.ping.p50), 1, false), count(n.ping95, bin.tenMs(m.ping.p95), 1, false), count(n.pingMax, bin.tenMs(m.ping.max), 1, false));
    for (const [code, k] of Object.entries(m.drops ?? {})) count(n.drops, code, k);
    for (const s of m.back ?? []) count(n.back, bin.tenth(s), 1, false);
    n.stalls += m.stalls ?? 0;
    for (const s of m.stallLong ?? []) count(n.stallLong, bin.tenth(s), 1, false);
    count(n.down, bin.rate(m.down), 1, false);
    count(n.up, bin.rate(m.up), 1, false);
  }
  return 204;
}
