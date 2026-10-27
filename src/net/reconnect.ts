import { NET, SERVER } from '../config.ts';
import { msg } from '../messages.ts';
import { rejectionOf, type Rejection, type ToServer } from './protocol.ts';
import type { Failure, NetStatus } from './status';

// Coming back after a link dropped, in a session or in the line for one: tries again after a wait that doubles
// (NET.retryFirst up to NET.retryMost) for as long as the server keeps the place (SERVER.rejoinWindow). The server
// too busy to take the player back counts as a failed try. Once the window is over the player is told.

type Join = Extract<ToServer, { type: 'join' }>;

/** What a status of tries needs to show: what was seen, the tries so far, and (seconds on the page's clock) when the place stops being held and the next try is. */
export interface Tries {
  detail: string;
  tries: number;
  until: number;
  retryAt: number;
}

/** The place to come back to. */
export interface Way {
  /** The JOIN that gets back to it. */
  hello(): Join;
  /** The place is still the one wanted (not left, not replaced). */
  held(): boolean;
  /** The status while trying. */
  status(t: Tries): NetStatus;
}

/** What it needs of the Multiplayer that holds it. */
interface Env {
  now(): number;
  log(line: string): void;
  /** There is a link (so no try is needed). */
  linked(): boolean;
  connect(hello: Join): void;
  /** Gives up. */
  fail(reason: 'expired' | Rejection, detail: string): void;
  set(s: NetStatus): void;
}

/** The rejections that are a server's trouble of the moment, not an answer: a player coming back tries again for as long as the server keeps them. */
const refusedForNow = (r?: Rejection) => (r === 'busy' || r === 'too-many' ? r : undefined);

/** How a game ends when the server turns it away (`back`: it is coming back to a session or its line); undefined if it doesn't: a server too busy is a failed try, and a session gone while coming back is the server's restart. */
export const endedBy = (r: Rejection, back: boolean): Failure | undefined => (back && refusedForNow(r) ? undefined : back && r === 'no-session' ? 'restarted' : r);

export class Reconnect {
  /** The tries since the place was lost: the window, the next wait, how many; null while it is held on a link. */
  private retry: { until: number; wait: number; tries: number } | null = null;
  private env: Env;
  /** Tries the link again now, instead of when the wait is over (the browser came back online); null when none is waiting. */
  now: (() => void) | null = null;

  constructor(env: Env) {
    this.env = env;
  }

  /** The place is held on a link again (welcomed, or in line), or the game is over: a drop starts its window anew. */
  reset() {
    this.retry = null;
  }

  /** The link closed (WebSocket close code `code`; `why`: what the server's trouble seems to be, asked over HTTP): another try after the wait, or the end. */
  dropped(code: number, way: Way, why: Promise<{ detail: string }>) {
    const env = this.env;
    const r = (this.retry ??= { until: env.now() + SERVER.rejoinWindow, wait: NET.retryFirst, tries: 0 });
    // A server too busy to take us back (busy, too-many) is a failed try like a dropped link; once the window is over that is what the player is told.
    const busy = refusedForNow(rejectionOf(code));
    if (env.now() > r.until) return env.fail(busy ?? 'expired', msg('menu.detailNoWayBack', { seconds: SERVER.rejoinWindow }));
    r.tries++;
    const retryAt = env.now() + r.wait;
    const seen = (detail: string) => way.status({ detail, tries: r.tries, until: r.until, retryAt });
    const tried = msg('menu.detailTry', { code, n: r.tries });
    env.set(seen(tried));
    void why.then((d) => this.retry === r && way.held() && env.set(seen(`${d.detail} · ${tried}`)));
    env.log(`trying again in ${r.wait} s (try ${r.tries})`);
    // After the wait, or at once when the browser says it is back online.
    const timer = setTimeout(() => this.now?.(), r.wait * 1000);
    this.now = () => {
      clearTimeout(timer);
      this.now = null;
      if (way.held() && !env.linked()) env.connect(way.hello());
    };
    r.wait = Math.min(r.wait * 2, NET.retryMost);
  }
}
