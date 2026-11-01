import { createHash, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import { SERVER } from '../../src/config';
import type { Kept } from '../kept';
import { site } from '../beacon';
import type { Lobby } from '../lobby';
import { log } from '../log';
import { keepMinutes } from '../minutes';
import { Busy, Missing, Refused } from '../refused';
import { bans } from './bans';
import { events, minutes } from './live';
import { Full, only, TooBig, WrongMethod, type Ctx, type Route } from './route';
import { logs, machineRoute, root } from './server';
import { sessions, uploads } from './sessions';
import { statsRoute } from './stats';

// The admin API, on its own port (SERVER.adminPort), never published: the admin command (server/admin.mjs, in the
// container) and the admin page through Caddy. What it takes and answers is docs/admin-api.md; this file is the
// door: the key, the origin, the body and the errors, then one module a resource.

const digest = (s: string) => createHash('sha256').update(s).digest();

/** The first part of the path, and the route that answers it. */
const routes: Record<string, Route> = {
  '': root,
  machine: machineRoute,
  logs,
  events,
  live: minutes,
  sessions,
  uploads,
  bans,
  stats: async (c) => {
    only(c, 'GET');
    return statsRoute(c.rest, c.q, c.kept.dir);
  },
};

/** ADMIN_ORIGIN as an origin (a trailing slash or a path in it is no matter), or null if unset or not one. */
function adminOrigin() {
  try {
    const { origin } = new URL(process.env.ADMIN_ORIGIN ?? '');
    return origin === 'null' ? null : origin;
  } catch {
    return null;
  }
}

/** The status and message an error is answered with. */
function failure(e: unknown): [number, string] {
  const message = (e as Error).message;
  if (e instanceof WrongMethod) return [405, e.method];
  if (e instanceof TooBig) return [413, message];
  if (e instanceof Missing) return [404, message];
  if (e instanceof Busy) return [409, message];
  if (e instanceof Refused) return [400, message];
  if (e instanceof Full) return [503, message];
  return [500, message];
}

export function adminApi(lobby: Lobby, kept: Kept, key: string) {
  const want = digest(key);
  const allowed = adminOrigin();
  keepMinutes(() => lobby.players, site);
  return http.createServer(async (req, res) => {
    const answer = (status: number, body: unknown) => res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(body));
    const auth = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
    if (!timingSafeEqual(digest(auth), want)) return answer(401, { error: 'no key' });
    if (req.headers.origin && req.headers.origin !== allowed) return answer(403, { error: 'origin' });
    try {
      const [first = '', ...rest] = (req.url ?? '/').split('?')[0].split('/').filter(Boolean);
      const route = Object.hasOwn(routes, first) ? routes[first] : null;
      if (!route) throw new Missing('not found');
      const c: Ctx = { lobby, kept, req, res, method: req.method ?? '', rest, q: new URL(req.url ?? '', 'http://admin').searchParams, body: () => body(req) };
      const out = await route(c);
      if (out !== undefined) answer(200, out);
    } catch (e) {
      log('-----', `admin ${req.method} ${req.url}:`, e);
      // Half answered (a stream, a download): nothing more to say.
      if (res.headersSent) return void res.destroy();
      const [status, error] = failure(e);
      answer(status, { error });
    }
  });
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
