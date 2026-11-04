import { NET } from '../config.ts';
import type { PaintOp } from '../paint-ops';

// This player's paint ops on their way to the server (BL-003): gathered from
// the paint log, sent NET.sendRate times a second as a numbered batch, and
// kept until the server says it has them (pong, welcome). A link that dies
// takes what was in flight with it: when the game comes back, the welcome's
// paint file replaces its paint, so what the server never had is painted
// again on top and sent again: NET.resendBurst batches at once, then one a link
// check (due), new paint waiting behind them, as a link that sends past its budget
// is closed (SERVER.linkBurst) and a batch the server sees out of order is dropped.
// A batch holds NET.batchOps ops at most, within NET.batchSpan s: what one message
// may hold, and how far an op's time reaches (op-wire.ts). The server drops a batch
// it already has.

/** A batch: its number, and its ops with when each was made (the snapshots' clock). */
type Batch = { seq: number; t: number[]; ops: PaintOp[] };

export class Outbox {
  private seq = 0;
  private batches: Batch[] = [];
  /** The last of `batches`, not sent yet: they go one at a time (due). */
  private unsent: Batch[] = [];
  /** Ops made since the last batch, and when (the snapshots' clock). */
  private ops: PaintOp[] = [];
  private t: number[] = [];

  /** The paint log's ops, made at time `at`, into the next batch; the log is emptied. */
  take(log: PaintOp[], at: number) {
    for (const op of log) this.ops.push(op), this.t.push(at);
    log.length = 0;
  }

  /** The next batch to send, kept until acked; null with nothing new, or batches still due before it. */
  batch(): Batch | null {
    if (this.unsent.length || !this.ops.length) return null;
    const [first, ...rest] = this.pack();
    this.unsent = rest;
    return first;
  }

  /** The next batch waiting its turn; null with none. */
  due() {
    return this.unsent.shift() ?? null;
  }

  /** The ops made so far as batches numbered on, kept until acked. */
  private pack() {
    const { ops, t } = this;
    const made: Batch[] = [];
    for (let i = 0, start = 0; i < ops.length; start = i) {
      while (i < ops.length && i - start < NET.batchOps && t[i] - t[start] <= NET.batchSpan) i++;
      made.push({ seq: ++this.seq, t: t.slice(start, i), ops: ops.slice(start, i) });
    }
    this.ops = [];
    this.t = [];
    this.batches.push(...made);
    return made;
  }

  /** The server has every batch up to `seq`. */
  acked(seq: number) {
    const i = this.batches.findIndex((b) => b.seq > seq);
    this.batches.splice(0, i < 0 ? this.batches.length : i);
  }

  /**
   * Back in the session, its paint file loaded, the server having batches up to `acked`: what it doesn't have
   * (lost with the link, or made since) painted again with `paint`; the batches to send again now, oldest first,
   * numbered on from `acked` (the rest are due).
   */
  rejoined(acked: number, paint: (op: PaintOp) => void): readonly Batch[] {
    this.acked(acked);
    this.ops = [...this.batches.flatMap((b) => b.ops), ...this.ops];
    this.t = [...this.batches.flatMap((b) => b.t), ...this.t];
    this.ops.forEach(paint);
    this.seq = acked;
    this.batches = [];
    const made = this.pack();
    this.unsent = made.slice(NET.resendBurst);
    return made.slice(0, NET.resendBurst);
  }

  /** A new page in the session: nothing to send, batches count on from `acked`, the last the server has from this player (0 when new). */
  clear(acked = 0) {
    this.seq = acked;
    this.batches = [];
    this.unsent = [];
    this.ops = [];
    this.t = [];
  }
}
