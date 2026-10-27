import { NET } from '../config.ts';
import type { InventoryData } from '../inventory/inventory';
import type { PropData } from '../level/level-data.ts';
import type { PaintOp } from '../paint-ops';
import type { ToServer } from './protocol.ts';

// What this player sends (multiplayer.ts puts it on the link, the ghost in
// dev/ghost.ts records it): their snapshot NET.sendRate times a second (NET.stillRate
// while they stand still), their
// stepladder when it moves, what they carry when it changes, and the paint ops
// they made. It owns paint.log: the one place it's begun and ended, and a
// second owner is refused, so a recording can't put back to null a log a
// session reads. It runs on the clock it's handed and nothing else is its own,
// so Node tests it (scripts/sender.test.mjs).

/** What the sender reads of the game. */
export interface SenderGame {
  /** This player now, as a snapshot's bytes (net/snapshot.ts), stamped `at`. */
  capture(at: number): Uint8Array;
  paint: { log: PaintOp[] | null };
  level: { props: ReadonlyMap<number, Pick<PropData, 'type' | 'pos' | 'rot'>>; runtimeOf(owner: string): number | undefined };
  /** Who owns the stepladder this player places (session.player). */
  owner(): string;
  inventory: { version: number; toJSON(): InventoryData };
}

/** What a frame gives out: `messages` in the order they go, the paint `ops` made since the last frame, and whether it was time for a snapshot (the last of the messages, unless the player stands still). */
export interface Sent {
  messages: ToServer[];
  ops: PaintOp[];
  tick: boolean;
}

export class Sender {
  /** The log this sender began, while paint.log is still it. */
  private mine: PaintOp[] | null = null;
  private nextSend = 0;
  private ladderId: number | undefined;
  /** The inventory's version last sent (the multiplayer test waits for it). */
  carried = -1;
  /** The last snapshot sent and when (`now`'s clock); one taken but not sent; whether the last two sent were alike. */
  private sent: Uint8Array | null = null;
  private sentAt = 0;
  private held: Uint8Array | null = null;
  private repeated = false;

  private g: SenderGame;

  constructor(g: SenderGame) {
    this.g = g;
  }

  /** Whether the paint ops made now are this sender's to take. */
  get logging() {
    return !!this.mine && this.g.paint.log === this.mine;
  }

  /**
   * Starts logging the paint ops this player makes. Refused (false) while another has the log; a session passes
   * `takeOver`: its log is the one that counts, and the other, when it ends, leaves it alone.
   */
  begin(takeOver = false) {
    const p = this.g.paint;
    if (p.log && p.log !== this.mine && !takeOver) return false;
    p.log = this.mine = [];
    return true;
  }

  /** Stops logging, if the log is still this sender's. */
  end() {
    if (this.logging) this.g.paint.log = null;
    this.mine = null;
  }

  /** Starts sending from the top: a snapshot now, the inventory again, the stepladder `ladder` already known to the others (none: sent when there is one). */
  restart(ladder?: number) {
    this.nextSend = 0;
    this.carried = -1;
    this.ladderId = ladder;
    [this.sent, this.held, this.repeated] = [null, null, false];
  }

  /** The paint ops made since last taken; the log is emptied. */
  take(): PaintOp[] {
    return this.logging ? this.g.paint.log!.splice(0) : [];
  }

  /** Once a frame: `now`, the clock the snapshots are spaced by; `at`, the time they're stamped with (the same clock, or its start moved). */
  update(now: number, at: number): Sent {
    const g = this.g;
    const messages: ToServer[] = [];
    const ops = this.take();
    const id = g.level.runtimeOf(g.owner());
    if (id !== this.ladderId) {
      this.ladderId = id;
      const p = id === undefined ? undefined : g.level.props.get(id);
      messages.push({ type: 'ladder', t: at, data: p ? { type: p.type, pos: [...p.pos], rot: p.rot } : null });
    }
    if (g.inventory.version !== this.carried) {
      this.carried = g.inventory.version;
      messages.push({ type: 'inventory', data: g.inventory.toJSON() });
    }
    const tick = now >= this.nextSend;
    if (tick) {
      this.nextSend = Math.max(this.nextSend + 1 / NET.sendRate, now);
      messages.push(...this.snapshots(g.capture(at), now));
    }
    return { messages, ops, tick };
  }

  /**
   * The snapshots to send at a tick: while the player stands still, none but NET.stillRate a second, once two alike
   * have gone (so the others see no speed to guess on with); when they move again, the one held back goes first, so
   * the others' timeline starts the move when it began.
   */
  private snapshots(s: Uint8Array, now: number): ToServer[] {
    const still = !!this.sent && stillAs(this.sent, s);
    if (still && this.repeated && now - this.sentAt < 1 / NET.stillRate) {
      this.held = s;
      return [];
    }
    const out: ToServer[] = this.held && !still ? [{ type: 'state', bytes: this.held }] : [];
    out.push({ type: 'state', bytes: s });
    [this.sent, this.sentAt, this.held, this.repeated] = [s, now, null, still];
    return out;
  }
}

/** Whether snapshot `b` shows its player as `a` did (net/snapshot.ts: the time first, the feet within NET.stillMove, the rest exactly). */
function stillAs(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length || a.length < 16) return false;
  const [va, vb] = [new DataView(a.buffer, a.byteOffset, a.length), new DataView(b.buffer, b.byteOffset, b.length)];
  for (let o = 4; o < 16; o += 4) if (Math.abs(va.getFloat32(o, true) - vb.getFloat32(o, true)) > NET.stillMove) return false;
  for (let i = 16; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
