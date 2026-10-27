import { NET } from '../config';
import { msg } from '../messages';
import { diagnose, type NetLog } from './diagnostics';
import { PROTOCOL, rejectionOf, type Rejection } from './protocol';
import { endedBy, type Reconnect, type Way } from './reconnect';
import type { NetStatus } from './status';

// What a game does when its link closes (multiplayer.ts): the server turned it away,
// or the link dropped and it tries to come back to its session or its place in line.

/** What it reads of the Multiplayer, when it needs it. */
export interface Place {
  joined(): { code: string; token: string; asked: string } | null;
  line(): { code: string; token: string; position: number } | null;
  /** There is a link (a new try's). */
  linked(): boolean;
  /** The name the last JOIN or HOST asked for. */
  asked(): string;
  /** Ends the game's session with `status`. */
  end(status: NetStatus): void;
}

export class LinkClosed {
  constructor(
    private place: Place,
    private reconnect: Reconnect,
    private log: NetLog,
  ) {}

  /** The link closed (WebSocket close code `code`; `timedOut`: no answer in NET.connectTimeout before the welcome): the game ends or tries to come back. */
  closed(code: number, timedOut: boolean) {
    const p = this.place;
    if (timedOut && !p.joined() && !p.line()) return p.end({ state: 'failed', reason: 'timeout', detail: msg('menu.detailNoAnswer', { seconds: NET.connectTimeout }) });
    const why = rejectionOf(code);
    if (why && this.turnedAway(why)) return;
    this.dropped(code);
  }

  /** The server turned this game away (its close code): the session ends, true; false when it's a failed try (dropped). */
  private turnedAway(reason: Rejection) {
    this.log.add(`turned away by the server: ${reason}`);
    const failed = endedBy(reason, Boolean(this.place.joined() || this.place.line()));
    return failed ? (this.place.end({ state: 'failed', reason: failed }), true) : false;
  }

  /**
   * While the server keeps us, try again with our token; never welcomed, give
   * up. Either way, ask the server over HTTP what's wrong (diagnostics.ts), for the message.
   */
  private dropped(code: number) {
    const p = this.place;
    const j = p.joined();
    const l = p.line();
    const why = diagnose().then((d) => (this.log.add(`asked the server over HTTP: ${d.reason} (${d.detail})`), d));
    const hello = { type: 'join', protocol: PROTOCOL, name: p.asked() } as const;
    // Back with the player's token, or the place in line's; the place is held as long as the player's own would be.
    const way: Way | null = j
      ? { hello: () => ({ ...hello, name: j.asked, code: j.code, token: j.token }), held: () => p.joined() === j, status: (t) => ({ state: 'reconnecting', code: j.code, detail: t.detail, tries: t.tries }) }
      : l && { hello: () => ({ ...hello, code: l.code, queue: l.token }), held: () => p.line() === l, status: (lost) => ({ state: 'queued', code: l.code, position: l.position, lost }) };
    if (way) return this.reconnect.dropped(code, way, why);
    void why.then((d) => !p.linked() && !p.joined() && p.end({ state: 'failed', reason: d.reason, detail: `${d.detail} · ${msg('menu.detailWs', { code })}` }));
  }
}
