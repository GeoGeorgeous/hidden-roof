import { createHash, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { PAINT_DETAIL, SERVER } from '../src/config';
import { SLOTS } from '../src/inventory/tool';
import { isPrivateLimit, isSessionName, isToolSet, PROTOCOL, SESSION_NAME_MAX } from '../src/net/protocol';
import { VERSION } from '../src/version';
import { site } from './beacon';
import { median } from './counts';
import { eventPage, stream } from './events';
import { parseId } from './event-log';
import { history, isPeriod } from './history';
import { log, overMemory } from './log';
import { machine } from './machine';
import type { Kept } from './kept';
import { Busy, Missing, Refused } from './refused';
import { isUploadId } from './uploads';
import type { Lobby } from './lobby';
import type { Session } from './session';
import type { SessionSetup } from './setup';
import { sources } from './sources';
import { trafficPeriod } from './traffic-period';
import { trafficDays } from './traffic-store';

// The admin API, on its own port (SERVER.adminPort), never published: the admin
// command (server/admin.mjs, in the container) and later the admin page through
// Caddy. Every request carries `Authorization: Bearer <ADMIN_KEY>`; any request that
// carries an Origin (a browser page's) is refused unless it is ADMIN_ORIGIN's (unset or not a URL: refused).
// JSON in and out; a request that's wrong answers 400 { error }, 404 for something that isn't there, 409 for something busy,
// 413 for a body past SERVER.adminBody bytes, and any other failure 500 { error }:
//   GET  /                     the API's version, the game's and the protocol, when the server started (`started`), the time now,
//                              sessions and players, the most players ever (`peak`), `slowPing` (ms): what counts as a slow ping, and
//                              `sources`: { status, beacon, history, traffic, geoip }, each { every (s), at (ISO or null) }: how often that
//                              source comes and when the last one did (sources.ts)
//   GET  /machine              CPU, RAM, the server's memory, disk, the paint saves, upload (machine.ts)
//   GET  /history?period=P     counts for today (since 00:00 UTC), or the last 24h, 7d or 30d (history.ts): plays, `players` and
//                              `inSessions` { device, address } (distinct over the period; players are who joined or reached the level),
//                              `playerCountries` (players by device, each by their last country), and the older `people`, `countries`
//   GET  /traffic?days=N       the last N days (1 to 366, 30 by default) of the site's traffic, oldest first, a day with no
//                              counts left out: { days: [{ day, views, visitors, bots, pages, sources, campaigns, countries, steps }] }
//                              (the traffic reader's, traffic.ts; none without DATA_DIR)
//   GET  /traffic?period=P     the same over the last hours of /history's periods (today, 24h, 7d, 30d), each visitor once over it:
//                              { period, from, to, views, bots, visitors, steps: { view, script, beacon, socket } }; `from`: the period's
//                              start, or when the hours begin if later (traffic-period.ts); zeros without DATA_DIR
//   GET  /events               the event stream (events.ts): `recent` events, then each `event` as it happens,
//                              and a `status` every second (the time, players, `site`, every session as listed but its saves);
//                              `site`: the open pages by what they do (menu, solo, session, hidden), each page once by its last beat in the last SERVER.beaconSiteSeconds (the game's beacons carry a page id)
//   GET  /events/page?before=ID&limit=N
//                              older events in pages: { events, next }, the events before event id ID (none: the newest; ID may be one no longer
//                              kept), newest first, N of them (1 to SERVER.eventPage, which is the default); `next`: the id to ask `before` for
//                              the page after, or null. From the files in DATA_DIR/events (event-log.ts), without DATA_DIR from the last few in memory.
//                              Every event has an `id`, `<ms>-<n>`, compared as numbers (ms, then n)
//   GET  /sessions             every session: its line (queue), players (address, ping, held seat),
//                              today's paint (`stamps` by tool, `colors`: ops by color code, `topColor` the most painted, for older pages) and peak,
//                              `stats`: its counts since its paint began (counts.ts SessionStats; also in the event stream's status): `since`,
//                              `began` (made, wiped, restored; `restoredAt` with the last), `stamps` by tool, `colors`, `painters` (distinct
//                              nicknames that painted), `playSeconds`, `joins` (new players), `peak` ({ players, at } or null),
//                              ping (`median` ms, `slow`: players over `slowPing`), when it went empty, its saves
//                              (`saves`, newest first: `at`, `bytes`, `wiped` for those a wipe kept aside, and `stats` { stamps (all tools but the sponge), painters } or null)
//   POST /uploads              a paint file (the body, application/octet-stream, up to SERVER.uploadBytes, streamed to DATA_DIR/uploads),
//                              checked as a save is loaded and kept SERVER.uploadMinutes: { upload, level, detail, bytes, expires }; 400 { error }
//                              if it is no good or not for a level of ours (or without DATA_DIR), 409 while another is being checked
//   POST /sessions             a new one: { kind, name, level?, detail?, tools?, stay?, limit?, upload? }
//                              (stay: a private one stays when empty; a public one always does;
//                              limit: a private one's most players, SERVER.privateMin to SERVER.players.private;
//                              upload: an id from POST /uploads: made on its level at its detail with its paint, and its stats start as made;
//                              a level or detail named too must be the upload's, else 400; an unknown or expired upload is 404)
//   POST /sessions/CODE/wipe   its paint gone (a public session's saves are put aside as wiped, replacing the last wipe's; its stats start again)
//   POST /sessions/CODE/close  closed for everyone in it (told `closed`)
//   POST /sessions/CODE/players/ID/kick
//                              a player out at once (told why, no seat held; a new join may come in, but a reconnect
//                              with their token is told 'kicked' for SERVER.rejoinWindow)
//   GET  /sessions/CODE/saves/MS
//                              a kept save's paint file (MS: its time, as the listing's `at` in ms): as the next, named by the save's time; 404 if none
//   POST /sessions/CODE/restore
//                              { save: MS } or { upload: ID }: its paint becomes that save's (and its stats; an upload has none: they start as
//                              restored), or the upload's, which must be for its level and detail (a public session of the admin's only). First a save of
//                              its paint now is made (the undo); its players are dropped as a wipe does and come back to the restored paint.
//                              Answers { undo: MS }; 404 for a save or session that isn't there, 409 while a restore or another disk
//                              task of that session is under way, 400 if the save or upload doesn't fit it (another level, detail or surface table)
//   GET  /sessions/CODE/paint  its paint as a paint file made now (not kept): application/octet-stream,
//                              attachment named <code>-<UTC time>.rhhpaint; 503 when there's no memory for one

/** Changes when what the API takes or answers does: the admin page lives in another repo. */
const ADMIN_API = 2;
const started = Date.now();

const digest = (s: string) => createHash('sha256').update(s).digest();
const detailName = (d: number) => Object.entries(PAINT_DETAIL).find(([, v]) => v === d)?.[0] ?? String(d);

const iso = (ms: number) => new Date(ms).toISOString();
/** A paint file's name: the session's code and the UTC time (now, or the save's), 2026-10-26T12-30-00Z. */
const paintName = (code: string, at = Date.now()) => `${code}-${iso(at).slice(0, 19).replaceAll(':', '-')}Z.rhhpaint`;

/** A session as the admin sees it, but its saves. A dropped player's `ip` is their last link's; `held`: seconds left to come back. */
function live(s: Session) {
  const { kind, name, limit, tools, stays, admin } = s.setup;
  const now = Date.now();
  const players = [...s.players.values()].map(({ id, name, link, was, joined }) => ({
    id,
    name,
    here: !!link,
    ip: link?.ip ?? was?.ip ?? null,
    country: link ? (link.country ?? null) : (was?.country ?? null),
    ping: link?.rtt ?? null,
    joined: iso(joined),
    held: link || !was ? null : Math.max(0, Math.round((was.at - now) / 1000 + SERVER.rejoinWindow)),
  }));
  const pings = players.flatMap((p) => (p.ping === null ? [] : [p.ping])).sort((a, b) => a - b);
  const { today } = s;
  today.players(s.players.size);
  return {
    code: s.code, kind, name, admin, stays, tools, level: s.levelName, detail: detailName(s.detail), players, limit, queue: s.line.length,
    started: iso(s.started), paintMB: Math.round(s.memory.now), emptySince: s.emptySince === null ? null : iso(s.emptySince),
    stats: s.stats.report(s.joinedAt()),
    today: { peak: today.peak, stamps: today.paint.stamps, colors: { ...today.paint.colors }, topColor: today.topColor },
    ping: { median: median(pings), slow: pings.filter((ms) => ms > SERVER.slowPing).length },
  };
}

/** A session as the admin sees it, with its saves. */
const listing = async (s: Session, kept: Kept) => ({ ...live(s), saves: await kept.savesOf(s.code) });

/** POST /sessions's body as a session to make, or why not. */
function newSession(b: unknown): string | { setup: Omit<SessionSetup, 'admin'>; level?: string; detail?: number; upload?: string } {
  const o = (typeof b === 'object' && b ? b : {}) as Record<string, unknown>;
  const kind = o.kind;
  if (kind !== 'public' && kind !== 'private') return 'kind: public or private';
  if (!isSessionName(o.name)) return `name: 1 to ${SESSION_NAME_MAX} characters`;
  if (o.upload !== undefined && !isUploadId(o.upload)) return 'upload: the id POST /uploads answered';
  // With an upload, the level and detail are its own; naming them is allowed if they agree.
  const name = o.detail ?? (o.upload ? undefined : 'ultra');
  const detail = name === undefined ? undefined : typeof name === 'string' && Object.hasOwn(PAINT_DETAIL, name) ? PAINT_DETAIL[name as keyof typeof PAINT_DETAIL] : 0;
  if (detail === 0) return `detail: one of ${Object.keys(PAINT_DETAIL).join(', ')}`;
  const tools = o.tools ?? SLOTS;
  if (!isToolSet(tools)) return `tools: some of ${SLOTS.join(', ')}`;
  const level = o.level ?? (o.upload ? undefined : 'roof');
  if (level !== undefined && typeof level !== 'string') return 'level: a level name';
  if (o.stay !== undefined && typeof o.stay !== 'boolean') return 'stay: true or false';
  if (o.limit !== undefined && (kind !== 'private' || !isPrivateLimit(o.limit))) return `limit: a private session's players, ${SERVER.privateMin} to ${SERVER.players.private}`;
  const limit = kind === 'public' ? SERVER.players.public : ((o.limit as number | undefined) ?? SERVER.players.private);
  return { setup: { kind, name: o.name.trim(), limit, tools: SLOTS.filter((t) => tools.includes(t)), stays: kind === 'public' || o.stay === true }, level, detail, upload: o.upload };
}

/** ADMIN_ORIGIN as an origin (a trailing slash or a path in it is no matter), or null if unset or not one. */
function adminOrigin() {
  try {
    const { origin } = new URL(process.env.ADMIN_ORIGIN ?? '');
    return origin === 'null' ? null : origin;
  } catch {
    return null;
  }
}

export function adminApi(lobby: Lobby, kept: Kept, key: string) {
  const want = digest(key);
  const allowed = adminOrigin();
  return http.createServer(async (req, res) => {
    const answer = (status: number, body: unknown) => res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body));
    const auth = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
    if (!timingSafeEqual(digest(auth), want)) return answer(401, { error: 'no key' });
    if (req.headers.origin && req.headers.origin !== allowed) return answer(403, { error: 'origin' });
    const parts = (req.url ?? '/').split('?')[0].split('/').filter(Boolean);
    try {
      if (req.method === 'GET' && !parts.length) return answer(200, { api: ADMIN_API, version: VERSION, protocol: PROTOCOL, started: iso(started), now: iso(Date.now()), sessions: lobby.sessions.size, players: lobby.players, peak: history.ever, slowPing: SERVER.slowPing, sources: await sources(kept.dir) });
      if (req.method === 'GET' && parts[0] === 'machine' && parts.length === 1) return answer(200, await machine(kept.dir));
      if (req.method === 'GET' && parts[0] === 'events' && parts.length === 1)
        return stream(res, () => ({ now: iso(Date.now()), players: lobby.players, site: site(), sessions: [...lobby.sessions.values()].map(live) }));
      if (req.method === 'GET' && parts[0] === 'events' && parts[1] === 'page' && parts.length === 2) {
        const q = new URL(req.url ?? '', 'http://admin').searchParams;
        const [before, limit] = [q.get('before'), q.get('limit') ?? String(SERVER.eventPage)];
        if (before !== null && !parseId(before)) return answer(400, { error: 'before: an event id, <ms>-<n>' });
        if (!/^\d{1,3}$/.test(limit) || +limit < 1 || +limit > SERVER.eventPage) return answer(400, { error: `limit: 1 to ${SERVER.eventPage}` });
        return answer(200, await eventPage(before, +limit));
      }
      if (req.method === 'GET' && parts[0] === 'history' && parts.length === 1) {
        const period = new URL(req.url ?? '', 'http://admin').searchParams.get('period') ?? '24h';
        return isPeriod(period) ? answer(200, history.report(period)) : answer(400, { error: 'period: today, 24h, 7d or 30d' });
      }
      if (req.method === 'GET' && parts[0] === 'traffic' && parts.length === 1) {
        const q = new URL(req.url ?? '', 'http://admin').searchParams;
        const period = q.get('period');
        if (period !== null) {
          if (!isPeriod(period)) return answer(400, { error: 'period: today, 24h, 7d or 30d' });
          return answer(200, await trafficPeriod(kept.dir && path.join(kept.dir, 'traffic'), period));
        }
        const days = q.get('days') ?? '30';
        if (!/^\d{1,3}$/.test(days) || +days < 1 || +days > 366) return answer(400, { error: 'days: 1 to 366' });
        return answer(200, kept.dir ? await trafficDays(kept.dir, +days) : { days: [] });
      }
      if (req.method === 'POST' && parts[0] === 'uploads' && parts.length === 1) {
        if (!kept.uploads) return answer(400, { error: 'uploads need DATA_DIR on the server' });
        if (overMemory(SERVER.hostMemory)) return answer(503, { error: 'the server is full' });
        const up = await kept.uploads.put(req);
        return answer(200, { upload: up.id, level: up.level, detail: detailName(up.detail), bytes: up.bytes, expires: iso(up.expires) });
      }
      if (parts[0] !== 'sessions') return answer(404, { error: 'not found' });
      if (req.method === 'GET' && parts.length === 1) return answer(200, await Promise.all([...lobby.sessions.values()].map((s) => listing(s, kept))));
      if (req.method === 'GET' && parts.length === 3 && parts[2] === 'paint') {
        const session = lobby.sessions.get(parts[1]);
        if (!session) return answer(404, { error: `no session ${parts[1]}` });
        const bytes = await session.paintFile();
        if (!bytes) return answer(503, { error: 'no memory for a paint file' });
        return res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${paintName(session.code)}"`, 'cache-control': 'no-store' }).end(bytes);
      }
      if (req.method === 'GET' && parts.length === 4 && parts[2] === 'saves') {
        if (!lobby.sessions.has(parts[1])) return answer(404, { error: `no session ${parts[1]}` });
        if (!/^\d{1,16}$/.test(parts[3])) return answer(400, { error: 'save: its time in ms' });
        const file = await kept.saveFile(parts[1], Number(parts[3]));
        const size = file && (await fs.stat(file).then((f) => f.size, () => null));
        if (!file || size === null) return answer(404, { error: `no save ${parts[3]} of ${parts[1]}` });
        res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': size, 'content-disposition': `attachment; filename="${paintName(parts[1], Number(parts[3]))}"`, 'cache-control': 'no-store' });
        return void pipeline(createReadStream(file), res).catch(() => res.destroy());
      }
      if (req.method !== 'POST') return answer(405, { error: 'POST' });
      if (parts.length === 1) {
        const m = newSession(await body(req));
        if (typeof m === 'string') return answer(400, { error: m });
        if (overMemory(SERVER.hostMemory)) return answer(503, { error: 'the server is full' });
        const up = m.upload ? await kept.upload(m.upload, m) : undefined;
        return answer(200, await listing(await kept.create(m.setup, up?.level ?? m.level!, up?.detail ?? m.detail!, up), kept));
      }
      const session = lobby.sessions.get(parts[1]);
      if (!session) return answer(404, { error: `no session ${parts[1]}` });
      if (parts[2] === 'players' && parts[4] === 'kick' && parts.length === 5) {
        if (!/^\d+$/.test(parts[3]) || !lobby.kick(session, Number(parts[3]))) return answer(404, { error: `no player ${parts[3]} in ${session.code}` });
      } else if (parts[2] === 'restore' && parts.length === 3) {
        const o = (await body(req)) as { save?: unknown; upload?: unknown };
        const one = (o.save === undefined) !== (o.upload === undefined);
        if (!one || (o.save !== undefined && !Number.isSafeInteger(o.save)) || (o.upload !== undefined && !isUploadId(o.upload))) return answer(400, { error: 'save: the ms of one of its saves, or upload: the id of one, not both' });
        if (overMemory(SERVER.hostMemory)) return answer(503, { error: 'the server is full' });
        return answer(200, { undo: await kept.restoreFrom(session, o.upload === undefined ? { save: o.save as number } : { upload: o.upload as string }) });
      } else if (parts[2] === 'wipe' && parts.length === 3) await kept.wipe(session);
      else if (parts[2] === 'close' && parts.length === 3) await kept.end(session);
      else return answer(404, { error: 'not found' });
      return answer(200, { ok: true });
    } catch (e) {
      log('-----', `admin ${req.method} ${req.url}:`, e);
      answer(e instanceof TooBig ? 413 : e instanceof Missing ? 404 : e instanceof Busy ? 409 : e instanceof Refused ? 400 : 500, { error: (e as Error).message });
    }
  });
}

/** A body past SERVER.adminBody (answered 413). */
class TooBig extends Refused {
  constructor() {
    super('too big');
  }
}

/** A request's JSON body, at most SERVER.adminBody bytes. A bigger one is read to its end and dropped, so the connection stays good. */
async function body(req: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size <= SERVER.adminBody) chunks.push(chunk);
  }
  if (size > SERVER.adminBody) throw new TooBig();
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as unknown;
  } catch {
    throw new Refused('not JSON');
  }
}
