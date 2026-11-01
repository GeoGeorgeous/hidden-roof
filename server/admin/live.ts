import { SERVER } from '../../src/config';
import { site } from '../beacon';
import { EVENT_TYPES, parseId, sinceId, type EventType } from '../event-log';
import { eventPage, stream } from '../events';
import { lastMinutes } from '../minutes';
import { Missing, Refused } from '../refused';
import { iso } from '../days';
import { only, upTo, type Route } from './route';
import { live } from './sessions';

// What happens now (docs/admin-api.md, Live and Events): the event stream, older events in pages, the last minutes.

/** GET /events: the event stream; GET /events/page: older events. */
export const events: Route = async (c) => {
  only(c, 'GET');
  if (!c.rest.length) return stream(c.res, () => ({ now: iso(Date.now()), players: c.lobby.players, pages: site(), sessions: [...c.lobby.sessions.values()].map(live) }));
  if (c.rest.length > 1 || c.rest[0] !== 'page') throw new Missing('not found');
  const { q } = c;
  const [before, since, limit] = [q.get('before'), q.get('since'), q.get('limit') ?? String(SERVER.eventPage)];
  if (before !== null && !parseId(before)) throw new Refused('before: an event id, <ms>-<n>');
  if (since !== null && !sinceId(since)) throw new Refused('since: an event id, <ms>-<n>, or a UTC time, 2026-10-27T12:00:00Z');
  const types = q.getAll('type');
  if (!types.every((t) => EVENT_TYPES.includes(t as EventType))) throw new Refused(`type: ${EVENT_TYPES.join(', ')}`);
  if (!upTo(limit, SERVER.eventPage)) throw new Refused(`limit: 1 to ${SERVER.eventPage}`);
  return eventPage(before, +limit, { since: since && sinceId(since), types: types as EventType[] });
};

/** GET /live/minutes: the last minutes, oldest first. */
export const minutes: Route = async (c) => {
  only(c, 'GET');
  if (c.rest.length !== 1 || c.rest[0] !== 'minutes') throw new Missing('not found');
  return lastMinutes();
};
