// How many times an address may do something a minute (lobby-http.ts lookups, lobby.ts JOINs to public sessions).

export class PerMinute {
  private seen = new Map<string, { since: number; n: number }>();

  /** `most` a minute from one address, and from `ips` addresses at once. */
  constructor(
    private most: number,
    private ips: number,
  ) {}

  /** One more from `ip`: false past `most` in its minute. */
  allow(ip: string) {
    const now = Date.now();
    if (this.seen.size >= this.ips) for (const [a, l] of this.seen) if (now - l.since >= 60_000) this.seen.delete(a);
    let l = this.seen.get(ip);
    if (!l || now - l.since >= 60_000) {
      // Every address is tracked, or none new: past `ips` live addresses the rest wait for the minute to turn.
      if (!l && this.seen.size >= this.ips) return false;
      this.seen.set(ip, (l = { since: now, n: 0 }));
    }
    return ++l.n <= this.most;
  }
}
