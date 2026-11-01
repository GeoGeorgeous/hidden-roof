import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { PAINT_DETAIL, SERVER } from '../../src/config';
import { SLOTS } from '../../src/inventory/tool';
import { isPrivateLimit, isSessionName, isToolSet, SESSION_NAME_MAX } from '../../src/net/protocol';
import { median } from '../counts';
import type { Kept } from '../kept';
import { overMemory } from '../log';
import { people } from '../people';
import { presence } from '../player';
import { Missing, Refused } from '../refused';
import type { Session } from '../session';
import type { SessionSetup } from '../setup';
import { isUploadId } from '../uploads';
import { Full, iso, only, type Ctx, type Route } from './route';

// The sessions (docs/admin-api.md, Sessions): the listing, making one, and what the admin does to one.

const detailName = (d: number) => Object.entries(PAINT_DETAIL).find(([, v]) => v === d)?.[0] ?? String(d);
/** A paint file's name: the session's code and the UTC time (now, or the save's), 2026-10-26T12-30-00Z. */
const paintName = (code: string, at = Date.now()) => `${code}-${iso(at).slice(0, 19).replaceAll(':', '-')}Z.rhhpaint`;

/** A session as the admin sees it, but its saves. A dropped player's `ip` is their last link's; `held`: seconds left to come back. */
export function live(s: Session) {
  const { kind, name, limit, tools, stays, admin } = s.setup;
  const now = Date.now();
  const players = [...s.players.values()].map((p) => {
    const { id, name, link, was, joined } = p;
    return {
      id,
      name,
      here: !!link,
      ip: link?.ip ?? was?.ip ?? null,
      country: link ? (link.country ?? null) : (was?.country ?? null),
      ping: link?.rtt ?? null,
      joined: iso(joined),
      held: link || !was ? null : Math.max(0, Math.round((was.at - now) / 1000 + was.hold)),
      state: presence(p),
      since: iso(p.since),
      seenDays: people.seenDays(p.device),
    };
  });
  const pings = players.flatMap((p) => (p.ping === null ? [] : [p.ping])).sort((a, b) => a - b);
  return {
    code: s.code, kind, name, admin, stays, tools, level: s.levelName, detail: detailName(s.detail), players, limit, queue: s.line.length,
    started: iso(s.started), paintMB: Math.round(s.memory.now), emptySince: s.emptySince === null ? null : iso(s.emptySince),
    stats: s.stats.report(s.joinedAt()),
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

/** POST /uploads: a paint file, checked and kept for a while. */
export const uploads: Route = async (c) => {
  only(c, 'POST');
  if (c.rest.length) throw new Missing('not found');
  if (!c.kept.uploads) throw new Refused('uploads need DATA_DIR on the server');
  if (overMemory(SERVER.hostMemory)) throw new Full('the server is full');
  const up = await c.kept.uploads.put(c.req);
  return { upload: up.id, level: up.level, detail: detailName(up.detail), bytes: up.bytes, expires: iso(up.expires) };
};

/** /sessions: the listing, a new session, and what is done to one by its code. */
export const sessions: Route = async (c) => {
  const [code, what, ...more] = c.rest;
  if (code === undefined) {
    if (c.method === 'GET') return Promise.all([...c.lobby.sessions.values()].map((s) => listing(s, c.kept)));
    only(c, 'POST');
    const m = newSession(await c.body());
    if (typeof m === 'string') throw new Refused(m);
    if (overMemory(SERVER.hostMemory)) throw new Full('the server is full');
    const up = m.upload ? await c.kept.upload(m.upload, m) : undefined;
    return listing(await c.kept.create(m.setup, up?.level ?? m.level!, up?.detail ?? m.detail!, up), c.kept);
  }
  const session = c.lobby.sessions.get(code);
  if (!session) throw new Missing(`no session ${code}`);
  if (what === 'paint' && !more.length) return paint(c, session);
  if (what === 'saves' && more.length === 1) return save(c, session, more[0]);
  only(c, 'POST');
  if (what === 'players' && more[1] === 'kick' && more.length === 2) {
    if (!/^\d+$/.test(more[0]) || !c.lobby.kick(session, Number(more[0]))) throw new Missing(`no player ${more[0]} in ${session.code}`);
  } else if (what === 'restore' && !more.length) {
    const b = await c.body();
    const o = (typeof b === 'object' && b && !Array.isArray(b) ? b : {}) as { save?: unknown; upload?: unknown };
    const one = (o.save === undefined) !== (o.upload === undefined);
    if (!one || (o.save !== undefined && !Number.isSafeInteger(o.save)) || (o.upload !== undefined && !isUploadId(o.upload))) throw new Refused('save: the ms of one of its saves, or upload: the id of one, not both');
    if (overMemory(SERVER.hostMemory)) throw new Full('the server is full');
    return { undo: await c.kept.restoreFrom(session, o.upload === undefined ? { save: o.save as number } : { upload: o.upload as string }) };
  } else if (what === 'wipe' && !more.length) await c.kept.wipe(session);
  else if (what === 'close' && !more.length) await c.kept.end(session);
  else throw new Missing('not found');
  return { ok: true };
};

/** GET /sessions/CODE/paint: its paint as a paint file made now. */
async function paint(c: Ctx, session: Session) {
  only(c, 'GET');
  const bytes = await session.paintFile();
  if (!bytes) throw new Full('no memory for a paint file');
  c.res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${paintName(session.code)}"`, 'cache-control': 'no-store' }).end(bytes);
}

/** GET /sessions/CODE/saves/MS: a kept save's paint file. */
async function save(c: Ctx, session: Session, ms: string) {
  only(c, 'GET');
  if (!/^\d{1,16}$/.test(ms)) throw new Refused('save: its time in ms');
  const file = await c.kept.saveFile(session.code, Number(ms));
  const size = file && (await fs.stat(file).then((f) => f.size, () => null));
  if (!file || size === null) throw new Missing(`no save ${ms} of ${session.code}`);
  c.res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': size, 'content-disposition': `attachment; filename="${paintName(session.code, Number(ms))}"`, 'cache-control': 'no-store' });
  await pipeline(createReadStream(file), c.res).catch(() => c.res.destroy());
}
