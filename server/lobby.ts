import { randomInt } from 'node:crypto';
import { SERVER } from '../src/config';
import { checkToServer, CODE_LENGTH, CODE_LETTERS, decode, PROTOCOL, type Rejection, type ToServer } from '../src/net/protocol';
import { event } from './events';
import { history } from './history';
import { log, logNoisy, who } from './log';
import type { LevelData } from '../src/level/level-data';
import { turnAway, type Link, type Player } from './player';
import type { Place } from './queue';
import { PerMinute } from './per-minute';
import { host } from './lobby-host';
import { Session } from './session';
import type { SessionSetup } from './setup';

// Who gets into which session: the live sessions by code, the codes of those
// that ended, each address's links, uploads and hosted sessions
// (SERVER.linksPerIp, uploadsPerIp, sessionsPerIp), HOST (lobby-host.ts, only if SERVER.playerHost) and JOIN (to a public session, SERVER.joinsPerIp a minute
// and SERVER.seatsPerIp seats or places in line per address), and each
// link's messages to its session; a JOIN with the token of a player the admin kicked is refused for SERVER.rejoinWindow;
// a JOIN that finds a session full waits in its line (queue.ts). main.ts gives it links (ws sockets); it
// speaks only Link, so tests give it fake ones (server/world-test.ts).

/** What a link's socket tells the lobby: a message, and its close. */
export interface LinkInput {
  message(data: Uint8Array): Promise<void>;
  closed(code: number, reason: string): void;
}

/** Where a link is once it is in: a session's player, or an entry in its line. */
type At = { session: Session; player: Player } | { session: Session; place: Place };

/** What the line calls when a place is free for a link: brings it in as its JOIN would have; true if the server had no memory for it (turned away, it keeps its place). */
type Seat = (session: Session, name: string) => (waited: number) => Promise<boolean>;

/** One more (or, `by` -1, one fewer) of an address's links in `counts`; how many it has now. */
const count = (counts: Map<string, number>, ip: string, by: number) => {
  const n = (counts.get(ip) ?? 0) + by;
  if (n > 0) counts.set(ip, n);
  else counts.delete(ip);
  return n;
};

export class Lobby {
  readonly sessions = new Map<string, Session>();
  /** Codes of sessions that ended, and when: joining one says it has ended rather than that there's no such code. */
  private ended = new Map<string, number>();
  /** Open links and HOST links per address, and the address each live session was hosted from. */
  private links = new Map<string, number>();
  private uploads = new Map<string, number>();
  private hosts = new Map<string, string>();
  /** Tokens of players the admin kicked, and when (ms): a JOIN with one is a reconnect and is told so, for SERVER.rejoinWindow. */
  private kicked = new Map<string, number>();
  /** JOINs to public sessions by address, SERVER.joinsPerIp a minute. */
  private joins = new PerMinute(SERVER.joinsPerIp, SERVER.joinIps);

  /**
   * A link that opened (`host`: on /ws?host, where saves come up): turned away
   * at once past its address's limits; closed if it sends no HOST or JOIN in
   * SERVER.helloTimeout, or a message the server can't take. Its socket's
   * messages and close go to what this returns (a link turned away too).
   */
  open(link: Link, host: boolean): LinkInput {
    const ip = link.ip;
    const reject = (reason: Rejection, m?: ToServer) => {
      const code = m?.type === 'join' && typeof m.code === 'string' ? m.code.slice(0, CODE_LENGTH) : '-----';
      const hello = m?.type === 'join' || m?.type === 'host' ? m : null;
      // Only what the log takes: a stranger's flood of attempts doesn't flood the admin's feed either.
      history.turnedAway(reason);
      if (logNoisy(ip, code, `${m?.type ?? 'link'} from ${ip} turned away: ${reason}`))
        event('turned-away', this.sessions.get(code) ?? null, hello?.name ?? null, reason === 'version' && hello ? { reason, client: hello.protocol, server: PROTOCOL } : { reason });
      turnAway(link, reason);
    };
    const uploading = () => [...this.uploads.values()].reduce((n, c) => n + c, 0);
    /** Their session and who they are in it, once welcomed, or their place in its line; 'waiting' while a host or join is under way. */
    let at: At | 'waiting' | null = null;
    let hello: ReturnType<typeof setTimeout> | undefined;
    /** Counted among its address's uploads (a HOST link let past the limit on links): given back when it closes. */
    let uploads = false;
    /** A LEAVE that came while the seat was being made: carried out as soon as it is. */
    let left = false;
    const bye = (r: At) => ('place' in r ? r.session.line.receive(r.place, { type: 'leave' }) : r.session.remove(r.player, 'left'));
    const seat: Seat = (session, name) => async (waited) => {
      at = 'waiting';
      try {
        const r = await this.seated(session, link, name, ip, undefined, waited);
        if (typeof r === 'string') {
          reject(r);
          if (r === 'busy' && !left) return true;
          session.line.update();
          return false;
        }
        at = r;
        if (left) bye(r);
        else if (!link.open) r.session.dropped(r.player, link);
      } catch (e) {
        log(session.code, `server error with ${ip}: closed`, e);
        link.close(1011, 'server error');
      }
      return false;
    };
    const input: LinkInput = {
      message: async (data) => {
        // A message the server can't handle closes that one link, never the server and everyone's sessions.
        try {
          const m = checkToServer(decode(data));
          if (!m) {
            logNoisy(ip, at && at !== 'waiting' ? at.session.code : '-----', `bad message from ${ip}: closed`);
            return link.close(1008, 'bad message');
          }
          if (at === 'waiting') {
            if (m.type === 'leave') left = true;
            return;
          }
          // A link replaced by another (a reconnect, another tab) is no longer theirs.
          if (at && 'place' in at) return at.place.link === link ? at.session.line.receive(at.place, m) : undefined;
          if (at) return at.player.link === link ? at.session.receive(at.player, m) : undefined;
          if (m.type !== 'host' && m.type !== 'join') return;
          link.device = m.device;
          at = 'waiting';
          const r = await this.enter(m, link, ip, seat);
          if (typeof r === 'string') return reject(r, m);
          at = r;
          if (left) return bye(r);
          if ('place' in r) return link.open ? r.session.line.update() : r.session.line.dropped(r.place, link);
          if (!link.open) r.session.dropped(r.player, link);
        } catch (e) {
          log(at && at !== 'waiting' ? at.session.code : '-----', `server error with ${ip}: closed`, e);
          link.close(1011, 'server error');
        }
      },
      closed: (code, reason) => {
        count(this.links, ip, -1);
        if (uploads) count(this.uploads, ip, -1);
        clearTimeout(hello);
        if (!at || at === 'waiting') return;
        if ('place' in at) return at.session.line.dropped(at.place, link);
        if (at.player.link !== link) return;
        // A closed tab (1001) lets its seat go soon; a lost link (1006) is held as long as it takes to come back.
        const hold = code === 1001 ? Math.min(SERVER.closedHold, SERVER.rejoinWindow) : SERVER.rejoinWindow;
        log(at.session.code, who(at.player), `dropped (${code}${reason.length ? ` ${reason}` : ''}): ${hold} s to come back`);
        at.session.dropped(at.player, link, hold);
      },
    };
    // Turned away: what it still sends is ignored; its close is counted.
    const away = (): LinkInput => (reject('too-many'), { message: async () => {}, closed: input.closed });
    if (count(this.links, ip, 1) > SERVER.linksPerIp) return away();
    if (host) {
      uploads = true;
      if (count(this.uploads, ip, 1) > SERVER.uploadsPerIp || uploading() > SERVER.uploads) return away();
    }
    hello = setTimeout(() => {
      if (at) return;
      logNoisy(ip, '-----', `link from ${ip}: no HOST or JOIN in ${SERVER.helloTimeout} s: closed`);
      link.close(1008, 'no host or join');
    }, SERVER.helloTimeout * 1000);
    return input;
  }

  /** Every session's paint runs move on (`dt` s). */
  tick(dt: number) {
    this.sessions.forEach((s) => s.tick(dt));
  }

  /** Every SERVER.ping: each session pings its players; ended codes older than SERVER.endedMemory are forgotten. */
  ping() {
    this.sessions.forEach((s) => s.ping());
    for (const [code, at] of this.ended) if (Date.now() - at > SERVER.endedMemory * 1000) this.ended.delete(code);
    for (const [token, at] of this.kicked) if (Date.now() - at > SERVER.rejoinWindow * 1000) this.kicked.delete(token);
  }

  /** The admin removes a player of `session` (session.ts); false if it has no such player. A new JOIN (without their token) may come in. */
  kick(session: Session, id: number) {
    const token = session.players.get(id)?.token;
    if (!token || !session.kick(id)) return false;
    this.kicked.set(token, Date.now());
    return true;
  }

  get players() {
    return [...this.sessions.values()].reduce((n, s) => n + s.players.size, 0);
  }

  /** HOST or JOIN: the session and the player (or their place in its line), or why not. */
  private async enter(m: Extract<ToServer, { type: 'host' | 'join' }>, link: Link, ip: string, seat: Seat): Promise<At | Rejection> {
    if (m.protocol !== PROTOCOL) return 'version';
    if (m.type === 'join' && m.token && (this.kicked.get(m.token) ?? 0) + SERVER.rejoinWindow * 1000 > Date.now()) return 'kicked';
    let session: Session;
    if (m.type === 'host') {
      const hosted = await host(m, ip, {
        sessions: this.sessions,
        hostedFrom: (a) => [...this.hosts.values()].filter((h) => h === a).length,
        start: (...made) => this.start(this.newCode(), ...made),
        list: (s, a) => (this.sessions.set(s.code, s), this.hosts.set(s.code, a)),
      });
      if (typeof hosted === 'string') return hosted;
      session = hosted;
    } else {
      const found = this.sessions.get(m.code);
      if (!found) return this.ended.has(m.code) ? 'ended' : 'no-session';
      session = found;
      // A held place in the line, taken back.
      const back = m.queue && session.line.resume(m.queue, link, m.name, seat(session, m.name));
      if (back) return { session, place: back };
      // A public session takes few JOINs from one address (not a reconnect, which has its token).
      if (session.setup.kind === 'public' && !m.token && !this.joins.allow(ip)) return 'rate';
    }
    const r = await this.seated(session, link, m.name, ip, m.type === 'join' ? m.token : undefined);
    if (r === 'full' && m.type === 'join') {
      if (session.setup.kind === 'public' && session.line.held(ip) >= SERVER.seatsPerIp) return 'seats';
      const place = session.line.add(link, m.name, seat(session, m.name));
      return place ? { session, place } : r;
    }
    // A session turned down with its host has no one to close it.
    if (typeof r === 'string' && m.type === 'host') session.close('its host turned away');
    return r;
  }

  /** `link` in `session` as a player (a JOIN's, or a place in the line's turn after `waited` ms), logged; or why not. */
  private async seated(session: Session, link: Link, name: string, ip: string, token?: string, waited?: number): Promise<{ session: Session; player: Player } | Rejection> {
    const r = await session.admit(link, name, token);
    if (typeof r === 'string') return r;
    log(session.code, who(r.p), `in from ${ip} (${r.how}, ${session.players.size} players${r.note})`);
    if (r.how === 'new') history.started(link);
    history.players(this.players);
    event('joined', session, r.p.name, waited === undefined ? { how: r.how } : { how: r.how, waited: Math.round(waited / 1000) });
    return { session, player: r.p };
  }

  /**
   * The admin's session (admin-api.ts), or one kept on disk under its `code`
   * (kept.ts), open at once. One that doesn't stay closes when its players
   * have gone, or if no one has come in SERVER.adminWait. Throws if the level doesn't build.
   */
  create(setup: Omit<SessionSetup, 'admin'>, levelName: string, level: LevelData, detail: number, code = this.newCode()) {
    const session = this.start(code, levelName, level, detail, { ...setup, admin: true });
    this.sessions.set(code, session);
    log(code, `made by the admin: ${setup.kind} ${JSON.stringify(setup.name)}, ${JSON.stringify(levelName)} at ${detail} texels/m, tools ${setup.tools.join(' ')}${setup.stays ? ', stays when empty' : ''}`);
    if (!setup.stays) setTimeout(() => session.close(`no one came in ${SERVER.adminWait} s`), SERVER.adminWait * 1000).unref();
    return session;
  }

  /** A session, closed when it's empty or by end(). */
  private start(code: string, levelName: string, level: LevelData, detail: number, setup?: SessionSetup) {
    const session = new Session(
      code,
      levelName,
      level,
      detail,
      (why) => {
        if (this.sessions.get(code) !== session) return;
        this.sessions.delete(code);
        this.hosts.delete(code);
        this.ended.set(code, Date.now());
        log(code, `closed: ${why}, ${session.summary}`);
        event('session-closed', session, null, { why });
      },
      setup,
    );
    return session;
  }

  private newCode() {
    let code: string;
    do code = Array.from({ length: CODE_LENGTH }, () => CODE_LETTERS[randomInt(CODE_LETTERS.length)]).join('');
    while (this.sessions.has(code) || this.ended.has(code));
    return code;
  }
}
