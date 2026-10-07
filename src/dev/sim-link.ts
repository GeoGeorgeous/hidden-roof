import { GHOST } from '../config';

// A pretend network for the ghost (ghost.ts), shaped like the WebSocket the
// game will use: messages arrive in order, each after GHOST.latency plus up to
// GHOST.jitter; a hiccup (a resent packet) holds one up by GHOST.hiccupDelay,
// and everything behind it waits.

export class SimLink<T> {
  private queue: { at: number; msg: T }[] = [];
  private last = 0;

  /** Send at local time `now` (s); `extra`: a further fixed delay. */
  send(msg: T, now: number, extra = 0) {
    const hiccup = Math.random() < GHOST.hiccups ? GHOST.hiccupDelay : 0;
    this.last = Math.max(this.last, now + extra + GHOST.latency + Math.random() * GHOST.jitter + hiccup);
    this.queue.push({ at: this.last, msg });
  }

  /** What has arrived by `now`, in the order it was sent. */
  receive(now: number): T[] {
    let n = 0;
    while (n < this.queue.length && this.queue[n].at <= now) n++;
    return this.queue.splice(0, n).map((q) => q.msg);
  }

  clear() {
    this.queue.length = 0;
    this.last = 0;
  }
}
