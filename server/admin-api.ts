import { createHash, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import { PAINT_DETAIL, SERVER } from '../src/config';
import { SLOTS } from '../src/inventory/tool';
import { isPrivateLimit, isSessionName, isToolSet, PROTOCOL, SESSION_NAME_MAX } from '../src/net/protocol';
import { VERSION } from '../src/version';
import { stream } from './events';
import { history, isPeriod } from './history';
import { log, overMemory } from './log';
import { machine } from './machine';
import type { Kept } from './kept';
import type { Lobby } from './lobby';
import type { Session, SessionSetup } from './session';

// The admin API, on its own port (SERVER.adminPort), never published: the admin
// command (server/admin.mjs, in the container) and later the admin page through
// Caddy. Every request carries `Authorization: Bearer <ADMIN_KEY>`; one from a
// browser page only from ADMIN_ORIGIN. JSON in and out:
//   GET  /                     the API's version, the game's and the protocol, uptime, the time now, the most players ever
//   GET  /machine              CPU, RAM, the server's memory, disk, the paint saves, upload (machine.ts)
//   GET  /history?period=P     counts for today (since 00:00 UTC), or the last 24h, 7d or 30d (history.ts)
//   GET  /events               the event stream (events.ts): `recent` events, then each `event` as it happens,
//                              and a `status` every second (the time, players, every session as listed but its saves)
//   GET  /sessions             every session: its line (queue), players (address, ping, held seat),
//                              today's paint and peak, ping, when it went empty, its saves
//                              (newest first, with those a wipe kept aside: `wiped`)
//   POST /sessions             a new one: { kind, name, level?, detail?, tools?, stay?, limit? }
//                              (stay: a private one stays when empty; a public one always does;
//                              limit: a private one's most players, SERVER.privateMin to SERVER.players.private)
//   POST /sessions/CODE/wipe   its paint gone
//   POST /sessions/CODE/close  ended for everyone in it

/** Changes when what the API takes or answers does: the admin page lives in another repo. */
const ADMIN_API = 2;
const started = Date.now();

const digest = (s: string) => createHash('sha256').update(s).digest();
const detailName = (d: number) => Object.entries(PAINT_DETAIL).find(([, v]) => v === d)?.[0] ?? String(d);

const iso = (ms: number) => new Date(ms).toISOString();

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
    today: { peak: today.peak, stamps: today.paint.stamps, topColor: today.topColor },
    ping: { median: pings.length ? pings[pings.length >> 1] : null, slow: pings.filter((ms) => ms > SERVER.slowPing).length },
  };
}

/** A session as the admin sees it, with its saves. */
const listing = async (s: Session, kept: Kept) => ({ ...live(s), saves: await kept.savesOf(s.code) });

/** POST /sessions's body as a session to make, or why not. */
function newSession(b: unknown): string | { setup: Omit<SessionSetup, 'admin'>; level: string; detail: number } {
  const o = (typeof b === 'object' && b ? b : {}) as Record<string, unknown>;
  const kind = o.kind;
  if (kind !== 'public' && kind !== 'private') return 'kind: public or private';
  if (!isSessionName(o.name)) return `name: 1 to ${SESSION_NAME_MAX} characters`;
  const detail = PAINT_DETAIL[(o.detail ?? 'ultra') as keyof typeof PAINT_DETAIL];
  if (!detail) return `detail: one of ${Object.keys(PAINT_DETAIL).join(', ')}`;
  const tools = o.tools ?? SLOTS;
  if (!isToolSet(tools)) return `tools: some of ${SLOTS.join(', ')}`;
  const level = o.level ?? 'roof';
  if (typeof level !== 'string') return 'level: a level name';
  if (o.stay !== undefined && typeof o.stay !== 'boolean') return 'stay: true or false';
  if (o.limit !== undefined && (kind !== 'private' || !isPrivateLimit(o.limit))) return `limit: a private session's players, ${SERVER.privateMin} to ${SERVER.players.private}`;
  const limit = kind === 'public' ? SERVER.players.public : ((o.limit as number | undefined) ?? SERVER.players.private);
  return { setup: { kind, name: o.name.trim(), limit, tools: SLOTS.filter((t) => tools.includes(t)), stays: kind === 'public' || o.stay === true }, level, detail };
}

export function adminApi(lobby: Lobby, kept: Kept, key: string) {
  const want = digest(key);
  return http.createServer(async (req, res) => {
    const answer = (status: number, body: unknown) => res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body));
    const auth = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
    if (!timingSafeEqual(digest(auth), want)) return answer(401, { error: 'no key' });
    if (req.headers.origin && req.headers.origin !== process.env.ADMIN_ORIGIN) return answer(403, { error: 'origin' });
    const parts = (req.url ?? '/').split('?')[0].split('/').filter(Boolean);
    try {
      if (req.method === 'GET' && !parts.length) return answer(200, { api: ADMIN_API, version: VERSION, protocol: PROTOCOL, started: iso(started), now: iso(Date.now()), sessions: lobby.sessions.size, players: lobby.players, peak: history.ever });
      if (req.method === 'GET' && parts[0] === 'machine' && parts.length === 1) return answer(200, await machine(kept.dir));
      if (req.method === 'GET' && parts[0] === 'events' && parts.length === 1)
        return stream(res, () => ({ now: iso(Date.now()), players: lobby.players, sessions: [...lobby.sessions.values()].map(live) }));
      if (req.method === 'GET' && parts[0] === 'history' && parts.length === 1) {
        const period = new URL(req.url ?? '', 'http://admin').searchParams.get('period') ?? '24h';
        return isPeriod(period) ? answer(200, history.report(period)) : answer(400, { error: 'period: today, 24h, 7d or 30d' });
      }
      if (parts[0] !== 'sessions') return answer(404, { error: 'not found' });
      if (req.method === 'GET' && parts.length === 1) return answer(200, await Promise.all([...lobby.sessions.values()].map((s) => listing(s, kept))));
      if (req.method !== 'POST') return answer(405, { error: 'POST' });
      if (parts.length === 1) {
        const m = newSession(await body(req));
        if (typeof m === 'string') return answer(400, { error: m });
        if (overMemory(SERVER.hostMemory)) return answer(503, { error: 'the server is full' });
        return answer(200, await listing(await kept.create(m.setup, m.level, m.detail), kept));
      }
      const session = lobby.sessions.get(parts[1]);
      if (!session) return answer(404, { error: `no session ${parts[1]}` });
      if (parts[2] === 'wipe') await kept.wipe(session);
      else if (parts[2] === 'close') await kept.end(session);
      else return answer(404, { error: 'not found' });
      return answer(200, { ok: true });
    } catch (e) {
      log('-----', `admin ${req.method} ${req.url}:`, e);
      answer(400, { error: (e as Error).message });
    }
  });
}

/** A request's JSON body, at most SERVER.adminBody bytes. */
async function body(req: http.IncomingMessage) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > SERVER.adminBody) throw new Error('too big');
  }
  return JSON.parse(text || '{}') as unknown;
}
