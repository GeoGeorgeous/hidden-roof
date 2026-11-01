import { prefix } from './address';

// How many times an address may do something in a window (a minute unless said): lobby-http.ts lookups, lobby.ts JOINs to
// public sessions, the beacon (beacon.ts), and the log's noisy lines (log.ts logNoisy). An IPv6 address is one by its /64.

/** A number, or a function that gives it each time (a limit that is read from SERVER as it is set). */
type Limit = number | (() => number);
const value = (l: Limit) => (typeof l === 'function' ? l() : l);

export class PerMinute {
  private seen = new Map<string, { since: number; n: number }>();

  /** `most` a window from one address, and from `ips` addresses at once; the window is `seconds` long. */
  constructor(
    private most: Limit,
    private ips: Limit,
    private seconds: Limit = 60,
  ) {}

  /** One more from `ip`: false past `most` in its window. */
  allow(ip: string) {
    const n = this.hit(ip);
    return n > 0 && n <= value(this.most);
  }

  /** One more from `ip`: how many that makes in its window, or 0 when it is none of the `ips` addresses tracked (a new one past them waits for a window to end). */
  hit(ip: string) {
    const [now, window, ips] = [Date.now(), value(this.seconds) * 1000, value(this.ips)];
    const key = prefix(ip);
    if (this.seen.size >= ips) for (const [a, l] of this.seen) if (now - l.since >= window) this.seen.delete(a);
    let l = this.seen.get(key);
    if (!l || now - l.since >= window) {
      // Every address is tracked, or none new: past `ips` live addresses the rest wait for the window to turn.
      if (!l && this.seen.size >= ips) return 0;
      this.seen.set(key, (l = { since: now, n: 0 }));
    }
    return ++l.n;
  }
}
