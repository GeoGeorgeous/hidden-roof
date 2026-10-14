import type { PaintOp } from '../paint-ops';
import type { ToServer } from './protocol';

// This player's paint ops on their way to the server (BL-003): gathered from
// the paint log, sent NET.sendRate times a second as a numbered batch, and
// kept until the server says it has them (pong, welcome). A link that dies
// takes what was in flight with it: when the game comes back, the welcome's
// paint file replaces its paint, so what the server never had is painted
// again on top and sent again. The server drops a batch it already has.

type Batch = Extract<ToServer, { type: 'ops' }>;

export class Outbox {
  private seq = 0;
  private batches: Batch[] = [];
  /** Ops made since the last batch, and when (the snapshots' clock). */
  private ops: PaintOp[] = [];
  private t: number[] = [];

  /** The paint log's ops, made at time `at`, into the next batch; the log is emptied. */
  take(log: PaintOp[], at: number) {
    for (const op of log) this.ops.push(op), this.t.push(at);
    log.length = 0;
  }

  /** The next batch to send, kept until acked; null with nothing new. */
  batch(): Batch | null {
    if (!this.ops.length) return null;
    const b: Batch = { type: 'ops', seq: ++this.seq, t: this.t, ops: this.ops };
    this.batches.push(b);
    this.ops = [];
    this.t = [];
    return b;
  }

  /** The server has every batch up to `seq`. */
  acked(seq: number) {
    const i = this.batches.findIndex((b) => b.seq > seq);
    this.batches.splice(0, i < 0 ? this.batches.length : i);
  }

  /**
   * Back in the session, its paint file loaded, the server having batches up to `acked`: what it doesn't have
   * (lost with the link, or made since) painted again with `paint`; the batches to send again, oldest first.
   */
  rejoined(acked: number, paint: (op: PaintOp) => void): readonly Batch[] {
    this.batch();
    this.acked(acked);
    for (const b of this.batches) b.ops.forEach(paint);
    return this.batches;
  }

  /** A new session: nothing to send, batches count from 1 again. */
  clear() {
    this.seq = 0;
    this.batches = [];
    this.ops = [];
    this.t = [];
  }
}
