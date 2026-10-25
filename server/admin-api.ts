import { createHash, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import { PAINT_DETAIL, SERVER } from '../src/config';
import { SLOTS, type Tool } from '../src/inventory/tool';
import { PROTOCOL, SESSION_NAME_MAX } from '../src/net/protocol';
import { log, overMemory } from './log';
import type { Kept } from './kept';
import type { Lobby } from './lobby';
import type { Session, SessionSetup } from './session';

// The admin API, on its own port (SERVER.adminPort), never published: the admin
// command (server/admin.mjs, in the container) and later the admin page through
// Caddy. Every request carries `Authorization: Bearer <ADMIN_KEY>`; one from a
// browser page only from ADMIN_ORIGIN. JSON in and out:
//   GET  /                     the API's version, the protocol, uptime
//   GET  /sessions             every session
//   POST /sessions             a new one: { kind, name, level?, detail?, tools?, stay? }
//                              (stay: a private one stays when empty; a public one always does)
//   POST /sessions/CODE/wipe   its paint gone
//   POST /sessions/CODE/close  ended for everyone in it

/** Changes when what the API takes or answers does: the admin page lives in another repo. */
const ADMIN_API = 1;
const started = Date.now();

const digest = (s: string) => createHash('sha256').update(s).digest();
const detailName = (d: number) => Object.entries(PAINT_DETAIL).find(([, v]) => v === d)?.[0] ?? String(d);

/** A session as the admin sees it. */
function listing(s: Session) {
  const { kind, name, tools, stays, admin } = s.setup;
  const players = [...s.players.values()].map((p) => ({ id: p.id, name: p.name, here: !!p.link }));
  return { code: s.code, kind, name, admin, stays, tools, level: s.levelName, detail: detailName(s.detail), players, limit: SERVER.players[kind], started: new Date(s.started).toISOString(), paintMB: Math.round(s.memory.now) };
}

/** POST /sessions's body as a session to make, or why not. */
function newSession(b: unknown): string | { setup: Omit<SessionSetup, 'admin'>; level: string; detail: number } {
  const o = (typeof b === 'object' && b ? b : {}) as Record<string, unknown>;
  const kind = o.kind;
  if (kind !== 'public' && kind !== 'private') return 'kind: public or private';
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  if (!name || name.length > SESSION_NAME_MAX || /\p{C}/u.test(name)) return `name: 1 to ${SESSION_NAME_MAX} characters`;
  const detail = PAINT_DETAIL[(o.detail ?? 'ultra') as keyof typeof PAINT_DETAIL];
  if (!detail) return `detail: one of ${Object.keys(PAINT_DETAIL).join(', ')}`;
  const tools = (o.tools ?? SLOTS) as Tool[];
  if (!Array.isArray(tools) || !tools.every((t) => SLOTS.includes(t)) || new Set(tools).size !== tools.length) return `tools: some of ${SLOTS.join(', ')}`;
  const level = o.level ?? 'roof';
  if (typeof level !== 'string') return 'level: a level name';
  if (o.stay !== undefined && typeof o.stay !== 'boolean') return 'stay: true or false';
  return { setup: { kind, name, tools: SLOTS.filter((t) => tools.includes(t)), stays: kind === 'public' || o.stay === true }, level, detail };
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
      if (req.method === 'GET' && !parts.length) return answer(200, { api: ADMIN_API, protocol: PROTOCOL, started: new Date(started).toISOString(), sessions: lobby.sessions.size, players: lobby.players });
      if (parts[0] !== 'sessions') return answer(404, { error: 'not found' });
      if (req.method === 'GET' && parts.length === 1) return answer(200, [...lobby.sessions.values()].map(listing));
      if (req.method !== 'POST') return answer(405, { error: 'POST' });
      if (parts.length === 1) {
        const m = newSession(await body(req));
        if (typeof m === 'string') return answer(400, { error: m });
        if (overMemory(SERVER.hostMemory)) return answer(503, { error: 'the server is full' });
        return answer(200, listing(await kept.create(m.setup, m.level, m.detail)));
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
