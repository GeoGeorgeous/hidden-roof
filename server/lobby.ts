import { randomInt } from 'node:crypto';
import { SERVER } from '../src/config';
import { checkToServer, closeCode, CODE_LENGTH, CODE_LETTERS, decode, encode, PROTOCOL, type Rejection, type ToServer } from '../src/net/protocol';
import { liveMemory, log, who } from './log';
import { Session, type Link, type Player } from './session';

// Who gets into which session: the live sessions by code, the codes of those
// that ended, each address's links, uploads and hosted sessions
// (SERVER.linksPerIp, uploadsPerIp, sessionsPerIp), HOST and JOIN, and each
// link's messages to its session. main.ts gives it links (ws sockets); it
// speaks only Link, so tests give it fake ones (server/world-test.ts).

/** What a link's socket tells the lobby: a message, and its close. */
export interface LinkInput {
  message(data: Uint8Array): Promise<void>;
  closed(code: number, reason: string): void;
}

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

  /**
   * A link that opened (`host`: on /ws?host, where saves come up): turned away
   * at once past its address's limits; closed if it sends no HOST or JOIN in
   * SERVER.helloTimeout, or a message the server can't take. Its socket's
   * messages and close go to what this returns (a link turned away too).
   */
  open(link: Link, host: boolean): LinkInput {
    const ip = link.ip;
    const reject = (reason: Rejection, m?: ToServer) => {
      log(m?.type === 'join' ? m.code : '-----', `${m?.type ?? 'link'} from ${ip} turned away: ${reason}`);
      link.send(encode({ type: 'rejected', reason }));
      link.close(closeCode(reason), reason);
    };
    const uploading = () => [...this.uploads.values()].reduce((n, c) => n + c, 0);
    /** Their session and who they are in it, once welcomed; 'waiting' while a host or join is under way. */
    let at: { session: Session; player: Player } | 'waiting' | null = null;
    let hello: ReturnType<typeof setTimeout> | undefined;
    const input: LinkInput = {
      message: async (data) => {
        // A message the server can't handle closes that one link, never the server and everyone's sessions.
        try {
          const m = checkToServer(decode(data));
          if (!m) {
            log(at && at !== 'waiting' ? at.session.code : '-----', `bad message from ${ip}: closed`);
            return link.close(1008, 'bad message');
          }
          if (at === 'waiting') return;
          // A link replaced by another (a reconnect, another tab) is no longer theirs.
          if (at) return at.player.link === link ? at.session.receive(at.player, m) : undefined;
          if (m.type !== 'host' && m.type !== 'join') return;
          at = 'waiting';
          const r = await this.enter(m, link, ip);
          if (typeof r === 'string') return reject(r, m);
          at = r;
          if (!link.open) r.session.dropped(r.player, link);
        } catch (e) {
          log(at && at !== 'waiting' ? at.session.code : '-----', `server error with ${ip}: closed`, e);
          link.close(1011, 'server error');
        }
      },
      closed: (code, reason) => {
        count(this.links, ip, -1);
        if (host) count(this.uploads, ip, -1);
        clearTimeout(hello);
        if (!at || at === 'waiting' || at.player.link !== link) return;
        log(at.session.code, who(at.player), `dropped (${code}${reason.length ? ` ${reason}` : ''}): ${SERVER.rejoinWindow} s to come back`);
        at.session.dropped(at.player, link);
      },
    };
    // Turned away: what it still sends is ignored; its close is counted.
    const away = (): LinkInput => (reject('too-many'), { message: async () => {}, closed: input.closed });
    if (count(this.links, ip, 1) > SERVER.linksPerIp) return away();
    if (host && (count(this.uploads, ip, 1) > SERVER.uploadsPerIp || uploading() > SERVER.uploads)) return away();
    hello = setTimeout(() => {
      if (at) return;
      log('-----', `link from ${ip}: no HOST or JOIN in ${SERVER.helloTimeout} s: closed`);
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
  }

  get players() {
    return [...this.sessions.values()].reduce((n, s) => n + s.players.size, 0);
  }

  /** HOST or JOIN: the session and the player, or why not. */
  private async enter(m: Extract<ToServer, { type: 'host' | 'join' }>, link: Link, ip: string): Promise<{ session: Session; player: Player } | Rejection> {
    if (m.protocol !== PROTOCOL) return 'version';
    let session: Session;
    if (m.type === 'host') {
      if ([...this.hosts.values()].filter((h) => h === ip).length >= SERVER.sessionsPerIp) return 'too-many';
      if (liveMemory() > SERVER.hostMemory) return 'busy';
      const code = this.newCode();
      try {
        session = new Session(code, m.levelName, m.level, m.detail, () => {
          this.sessions.delete(code);
          this.hosts.delete(code);
          this.ended.set(code, Date.now());
          log(code, `closed: no one left, ${session.summary}`);
        });
      } catch (e) {
        log('-----', `host from ${ip}: the level doesn't build`, e);
        return 'bad-level';
      }
      if (session.table !== m.table) return 'version';
      if (m.bytes)
        try {
          await session.load(m.bytes);
        } catch (e) {
          log('-----', `host from ${ip}: paint file refused: ${(e as Error).message}`);
          return 'bad-save';
        }
      this.sessions.set(code, session);
      this.hosts.set(code, ip);
      const mb = session.memory;
      log(code, `hosted by ${ip}: ${m.levelName} at ${m.detail} texels/m, ${mb.now.toFixed(0)} MB of paint (${mb.full.toFixed(0)} MB if all painted), ${this.sessions.size} sessions`);
    } else {
      const found = this.sessions.get(m.code);
      if (!found) return this.ended.has(m.code) ? 'ended' : 'no-session';
      session = found;
    }
    const r = await session.admit(link, m.name, m.type === 'join' ? m.token : undefined);
    if (typeof r === 'string') {
      // A session turned down with its host has no one to close it.
      if (m.type === 'host') session.close();
      return r;
    }
    log(session.code, who(r.p), `in from ${ip} (${r.how}, ${session.players.size} players${r.note})`);
    return { session, player: r.p };
  }

  private newCode() {
    let code: string;
    do code = Array.from({ length: CODE_LENGTH }, () => CODE_LETTERS[randomInt(CODE_LETTERS.length)]).join('');
    while (this.sessions.has(code) || this.ended.has(code));
    return code;
  }
}
