import { SERVER } from '../src/config';
import type { site } from './beacon';
import { traffic } from './counts';

// The admin's live minutes (GET /live/minutes, admin/live.ts): at the end of each minute one entry, kept in memory
// for SERVER.liveMinutes, lost on restart. Rates are the minute's average from the bytes sent and received.

interface Minute {
  at: string;
  pages: ReturnType<typeof site>;
  /** Players in sessions. */
  players: number;
  upBits: number;
  downBits: number;
  turnedAway: Record<string, number>;
}

const ring: Minute[] = [];
let turned: Record<string, number> = {};
let mark = { at: Date.now(), sent: traffic.sent, received: traffic.received };

/** A link turned away for `reason` (a close code's name), counted in this minute. */
export const turnedAway = (reason: string) => void (turned[reason] = (turned[reason] ?? 0) + 1);

/** The minute that ends at `now` is added: `players` are in sessions, `pages` the site's, now. */
export function closeMinute(now: number, players: number, pages: Minute['pages']) {
  const seconds = Math.max(1, (now - mark.at) / 1000);
  ring.push({
    at: new Date(now).toISOString(),
    pages,
    players,
    upBits: Math.round(((traffic.sent - mark.sent) * 8) / seconds),
    downBits: Math.round(((traffic.received - mark.received) * 8) / seconds),
    turnedAway: turned,
  });
  if (ring.length > SERVER.liveMinutes) ring.shift();
  turned = {};
  mark = { at: now, sent: traffic.sent, received: traffic.received };
}

/** The last minutes, oldest first. */
export const lastMinutes = () => [...ring];

/** Starts the minutes: `players` counts those in sessions, `pages` the site's. */
export function keepMinutes(players: () => number, pages: () => Minute['pages']) {
  mark = { at: Date.now(), sent: traffic.sent, received: traffic.received };
  setInterval(() => closeMinute(Date.now(), players(), pages()), 60e3).unref();
}
