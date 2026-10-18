import { NET } from '../config.ts';
import type { InventoryData } from '../inventory/inventory';
import type { PropData } from '../level/level-data.ts';
import type { PaintOp } from '../paint-ops';
import type { ToServer } from './protocol.ts';

// What this player sends (multiplayer.ts puts it on the link, the ghost in
// dev/ghost.ts records it): their snapshot NET.sendRate times a second, their
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

/** What a frame gives out: `messages` in the order they go, the paint `ops` made since the last frame, and whether it was time for a snapshot (the last of the messages). */
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
      messages.push({ type: 'state', bytes: g.capture(at) });
    }
    return { messages, ops, tick };
  }
}
