import { SERVER } from '../src/config';

// A seat or a place in line whose link closed is held for a while: a timer that gives it up (session.ts, queue.ts).

/** Anything that is held: a player's seat, a place in line. */
export interface Held {
  expires: ReturnType<typeof setTimeout> | null;
}

/** `h` is held for `seconds`, then `giveUp`; a hold it had is replaced. */
export function hold(h: Held, seconds: number, giveUp: () => void) {
  release(h);
  h.expires = setTimeout(giveUp, seconds * 1000);
}

/** `h` is taken back (or gone): its hold ends. */
export function release(h: Held) {
  if (h.expires) clearTimeout(h.expires);
  h.expires = null;
}

/** How long (s) the seat or place of a link that closed with `code` is held: a closed tab (1001) lets it go soon; a lost link (1006) is held as long as it takes to come back. */
export const holdFor = (code: number) => (code === 1001 ? Math.min(SERVER.closedHold, SERVER.rejoinWindow) : SERVER.rejoinWindow);
