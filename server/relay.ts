import { relayFrame } from '../src/net/protocol';
import type { Player } from './player';

// The others' states and paint ops go to a player as one relay frame per flush,
// not as a frame each: the server's frames out then grow with the players, not
// with their square (its one thread was full at ~60 players by its frames,
// docs/ideas/weak-links.md). A flush comes once the event loop's turn is done,
// so nothing waits longer than what came in with it; any other frame to a player
// sends theirs first (player.ts deliver), so what they get keeps its order.

const pending = new Map<Player, Uint8Array[]>();
let due = false;

/** `entry` (protocol.ts relayEntry) to `p`, in their next relay frame. */
export function relay(p: Player, entry: Uint8Array) {
  if (!p.live || !p.link) return;
  const list = pending.get(p);
  if (list) list.push(entry);
  else pending.set(p, [entry]);
  if (!due) {
    due = true;
    setImmediate(flushAll);
  }
}

/** What waits for `p` goes now. */
export function flush(p: Player) {
  const list = pending.get(p);
  if (!list) return;
  pending.delete(p);
  if (p.live) p.link?.send(relayFrame(list));
}

/** What waits for `p` is dropped: their link changed, and their welcome brings them up to date. */
export function forget(p: Player) {
  pending.delete(p);
}

function flushAll() {
  due = false;
  for (const p of [...pending.keys()]) flush(p);
}
