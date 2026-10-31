import { NET, SERVER } from '../../src/config';
import { PROTOCOL, SESSION_NAME_MAX } from '../../src/net/protocol';
import { VERSION } from '../../src/version';
import { history } from '../history';
import { machine } from '../machine';
import { sources } from '../sources';
import { logDays, sendLog } from './logs';
import { Missing, Refused } from '../refused';
import { iso, only, type Route } from './route';

// The server itself (docs/admin-api.md, Server): GET /, GET /machine and the log.

/** Changes when what the API takes or answers does: the admin page lives in another repo. */
const ADMIN_API = 4;
const started = Date.now();

export const root: Route = async (c) => {
  only(c, 'GET');
  return {
    api: ADMIN_API,
    version: VERSION,
    protocol: PROTOCOL,
    started: iso(started),
    now: iso(Date.now()),
    sessions: c.lobby.sessions.size,
    players: c.lobby.players,
    peak: history.ever,
    limits: { public: SERVER.players.public, private: { min: SERVER.privateMin, max: SERVER.players.private }, name: SESSION_NAME_MAX },
    settings: {
      slowPing: SERVER.slowPing,
      saveEvery: SERVER.keepEvery,
      saveAges: SERVER.keepAges.filter(Boolean),
      eventDays: SERVER.eventDays,
      eventDayBytes: SERVER.eventDayBytes,
      historyDays: SERVER.historyDays,
      saltDays: SERVER.saltDays,
      pageIdle: NET.beaconIdle,
      playerIdle: NET.idleAfter,
      lengthMinutesMost: SERVER.lengthMinutesMost,
    },
    sources: await sources(c.kept.dir),
  };
};

export const machineRoute: Route = async (c) => {
  only(c, 'GET');
  return machine(c.kept.dir);
};

/** GET /logs: the day files; GET /logs/DAY: one as it is. */
export const logs: Route = async (c) => {
  only(c, 'GET');
  if (!c.rest.length) return logDays();
  if (c.rest.length > 1) throw new Missing('not found');
  const sent = await sendLog(c.res, c.rest[0], c.q.get('session'));
  if (sent === false) throw new Refused('a day, YYYY-MM-DD, and a session code');
  if (sent === null) throw new Missing(`no log for ${c.rest[0]}`);
};
