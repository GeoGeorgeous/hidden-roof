import { SERVER } from '../../src/config';
import type { Ban } from '../bans';
import { iso } from '../days';
import { Missing, Refused } from '../refused';
import { only, type Route } from './route';

// The bans (docs/admin-api.md, Bans): the list, a player of a session banned, a ban lifted.

const shown = (b: Ban) => ({ id: b.id, name: b.name, reason: b.reason, made: iso(b.made), until: b.until === null ? null : iso(b.until) });
const daysOk = (d: unknown) => SERVER.banDays.includes(d as number | null);
const DAYS = `days: one of ${SERVER.banDays.map((d) => d ?? 'null').join(', ')}`;
const REASON = `reason: 1 to ${SERVER.banReasonBytes} bytes`;
const reasonOk = (r: unknown): r is string => typeof r === 'string' && r.trim().length > 0 && Buffer.byteLength(r.trim()) <= SERVER.banReasonBytes;

/** /bans: GET the bans in force; POST { code, player, days, reason } bans a player of a session; POST /bans/ID { days?, reason? } changes one; POST /bans/ID/lift. */
export const bans: Route = async (c) => {
  const [id, what, ...more] = c.rest;
  if (id === undefined) {
    if (c.method === 'GET') return c.lobby.bans.all.map(shown);
    only(c, 'POST');
    const b = await c.body();
    const o = (typeof b === 'object' && b && !Array.isArray(b) ? b : {}) as Record<string, unknown>;
    if (typeof o.code !== 'string' || !Number.isInteger(o.player)) throw new Refused('code: a session, player: the id of one of its players');
    if (!daysOk(o.days)) throw new Refused(DAYS);
    if (!reasonOk(o.reason)) throw new Refused(REASON);
    const session = c.lobby.sessions.get(o.code);
    if (!session) throw new Missing(`no session ${o.code}`);
    const ban = await c.lobby.ban(session, o.player as number, o.days as number | null, o.reason.trim());
    if (!ban) throw new Missing(`no player ${o.player} in ${session.code}`);
    return shown(ban);
  }
  only(c, 'POST');
  if (more.length || (what !== undefined && what !== 'lift')) throw new Missing('not found');
  if (what === 'lift') {
    if (!(await c.lobby.bans.lift(id))) throw new Missing(`no ban ${id}`);
    return { ok: true };
  }
  const b = await c.body();
  const o = (typeof b === 'object' && b && !Array.isArray(b) ? b : {}) as Record<string, unknown>;
  if (o.days !== undefined && !daysOk(o.days)) throw new Refused(DAYS);
  if (o.reason !== undefined && !reasonOk(o.reason)) throw new Refused(REASON);
  const ban = await c.lobby.bans.change(id, { days: o.days as number | null | undefined, reason: (o.reason as string | undefined)?.trim() });
  if (!ban) throw new Missing(`no ban ${id}`);
  if (ban === 'longer') throw new Refused('days: a ban only ends sooner');
  return shown(ban);
};
