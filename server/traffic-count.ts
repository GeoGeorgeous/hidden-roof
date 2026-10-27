import { createHash, randomBytes } from 'node:crypto';
import { SERVER } from '../src/config';
import { prefix } from './people';

// What the traffic reader (traffic.ts) makes of a line of Caddy's access log (its JSON format) and of a day's
// counts. Bots are counted and nothing else about them. A visitor is a salted hash of address (an IPv6 one by its
// /64) and browser, a new salt every SERVER.saltDays: the hashes are all that is kept of them, by the hour they
// were seen in (up to SERVER.trafficHourSeen an hour), for SERVER.historyDays days, so a period's visitors count once.

export const STEPS = ['view', 'script', 'beacon', 'socket'] as const;
type Step = (typeof STEPS)[number];
type Counts = Record<string, number>;

/** One UTC day, as GET /traffic answers it (but its date). */
export interface Day {
  views: number;
  visitors: number;
  bots: number;
  pages: Counts;
  sources: Counts;
  campaigns: Counts;
  countries: Counts;
  /** Visitors who got this far. */
  steps: Record<Step, number>;
}

/** One UTC hour: its views and bots, and each visitor seen (a hash) with the steps they got to (a bit each, in STEPS order). */
export interface Hour {
  views: number;
  bots: number;
  seen: Map<string, number>;
}

/** The day being counted: its date, its salt, its hours, who has been seen at each step in the day (hashes, from the hours) and its counts. */
export interface Today {
  name: string;
  salt: string;
  hours: Map<number, Hour>;
  seen: Record<Step, Set<string>>;
  day: Day;
}

export interface Hit {
  ts: number;
  ip: string;
  method: string;
  host: string;
  uri: string;
  url: URL;
  agent: string;
  referer: string;
  status: number;
  type: string;
}

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|curl|wget|python|go-http|headless/i;

export const dayName = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);
export const blank = (): Day => ({ views: 0, visitors: 0, bots: 0, pages: {}, sources: {}, campaigns: {}, countries: {}, steps: { view: 0, script: 0, beacon: 0, socket: 0 } });
export const newSalt = () => randomBytes(16).toString('hex');
export const fresh = (name: string, salt: string, hours = new Map<number, Hour>()): Today => {
  const seen = { view: new Set<string>(), script: new Set<string>(), beacon: new Set<string>(), socket: new Set<string>() };
  for (const h of hours.values()) for (const [id, mask] of h.seen) STEPS.forEach((step, i) => mask & (1 << i) && seen[step].add(id));
  return { name, salt, hours, seen, day: blank() };
};

/** A line as a hit, or null if it isn't JSON or lacks what is counted. */
export function parse(line: string): Hit | null {
  try {
    const o = JSON.parse(line);
    const r = o.request;
    const first = (name: string) => (Array.isArray(r.headers?.[name]) ? r.headers[name][0] : undefined);
    const ip = r.client_ip || r.remote_ip;
    const type = o.resp_headers?.['Content-Type']?.[0];
    const strings = [ip, r.method, r.host, r.uri, first('User-Agent')];
    if (!Number.isFinite(o.ts) || !Number.isInteger(o.status) || strings.some((s) => typeof s !== 'string' || !s)) return null;
    const referer = first('Referer');
    return { ts: o.ts, ip, method: r.method, host: r.host, uri: r.uri, url: new URL(r.uri, 'http://roof'), agent: first('User-Agent'), referer: typeof referer === 'string' ? referer : '', status: o.status, type: typeof type === 'string' ? type : '' };
  } catch {
    return null;
  }
}

/** A path that is a page: no file extension, or .html, and not an asset. */
const isPage = (path: string) => !path.startsWith('/assets/') && /^[^.]*$|\.html$/.test(path.slice(path.lastIndexOf('/') + 1));

/** The host a request was for, without its port. */
const hostOf = (host: string) => host.replace(/:\d+$/, '').toLowerCase();
const bare = (host: string) => host.replace(/^www\./, '');

/** `key` counted in `to`; past SERVER.trafficKinds keys a new name is Other. */
function count(to: Counts, key: string) {
  key = key.slice(0, SERVER.trafficText);
  const k = Object.hasOwn(to, key) || Object.keys(to).length < SERVER.trafficKinds ? key : 'Other';
  to[k] = (to[k] ?? 0) + 1;
}

/** Where a view came from: ?ref=, ?utm_source=, the referring site if it isn't ours, else direct. */
function source(q: URLSearchParams, h: Hit, hosts: string[]) {
  const named = (q.get('ref') || q.get('utm_source') || '').trim().toLowerCase();
  if (named) return named;
  try {
    const from = bare(new URL(h.referer).hostname.toLowerCase());
    if (from && ![...hosts, hostOf(h.host)].some((own) => bare(own) === from)) return from;
  } catch {
    // no referrer, or not an address
  }
  return 'direct';
}

/** The hour of `ts` (s) in the day being counted. */
function hourOf(t: Today, ts: number) {
  const k = new Date(ts * 1000).getUTCHours();
  let hour = t.hours.get(k);
  if (!hour) t.hours.set(k, (hour = { views: 0, bots: 0, seen: new Map() }));
  return hour;
}

/** `h` counted into `t`: true if anything changed. `hosts`: our own (empty: every host counts); `country`: the address's country, if known. */
export function add(t: Today, h: Hit, hosts: string[], country: (ip: string) => string | null) {
  if (hosts.length && !hosts.includes(hostOf(h.host))) return false;
  const { url } = h;
  // A page is served as text/html; to a returning visitor it is a 304 (Go's ServeContent) with no type, so the path says.
  const page = h.method === 'GET' && ((h.status === 200 && h.type.toLowerCase().startsWith('text/html')) || (h.status === 304 && isPage(url.pathname)));
  if (BOT.test(h.agent)) {
    if (page) (t.day.bots++, hourOf(t, h.ts).bots++);
    return page;
  }
  const step: Step | null = page
    ? 'view'
    : h.method === 'GET' && (h.status === 200 || h.status === 304) && url.pathname.startsWith('/assets/') && url.pathname.endsWith('.js')
      ? 'script'
      : h.method === 'POST' && h.uri === '/ws?e' && h.status === 204
        ? 'beacon'
        : h.method === 'GET' && url.pathname === '/ws' && h.status === 101
          ? 'socket'
          : null;
  if (!step) return false;
  const hour = hourOf(t, h.ts);
  const id = createHash('sha256').update(t.salt).update(prefix(h.ip)).update('\0').update(h.agent).digest('base64url').slice(0, 16);
  // Past SERVER.trafficHourSeen visitors in an hour the rest are not remembered (their views still count).
  if (hour.seen.has(id) || hour.seen.size < SERVER.trafficHourSeen) {
    hour.seen.set(id, (hour.seen.get(id) ?? 0) | (1 << STEPS.indexOf(step)));
    t.seen[step].add(id);
  }
  if (step === 'view') {
    t.day.views++;
    hour.views++;
    count(t.day.pages, url.pathname);
    count(t.day.sources, source(url.searchParams, h, hosts));
    const campaign = url.searchParams.get('utm_campaign')?.trim().toLowerCase();
    if (campaign) count(t.day.campaigns, campaign);
    const c = country(h.ip);
    if (c) count(t.day.countries, c);
  }
  // A day's file ahead of its hours file (one write of the two failed) never counts down.
  for (const s of STEPS) t.day.steps[s] = Math.max(t.day.steps[s], t.seen[s].size);
  t.day.visitors = Math.max(t.day.visitors, t.seen.view.size);
  return true;
}
