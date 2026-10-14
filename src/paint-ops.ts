import type { PaintDrips } from './paint-drips';
import type { PaintSystem, Rgb } from './painting';

// Paint operations: each stamp and roll the tools make and each run they
// start, as data. A surface by key and a face point (u, v across the face) are
// the same on every client and at every paint detail, so a recorded op paints
// the same spot anywhere.
// PaintSystem.log records the local ones; apply() replays an op from elsewhere
// (another player, a save, the loopback test).

interface At {
  /** Surface key (PaintSurface.key) and face point. */
  key: string;
  rect: number;
  u: number;
  v: number;
}

export interface StampOp extends At {
  kind: 'stamp';
  radius: number;
  amount: number;
  color: Rgb | null;
  softness: number;
  square: boolean;
}

export interface RollOp extends At {
  kind: 'roll';
  axis: [number, number, number];
  halfLength: number;
  halfWidth: number;
  edge: number;
  amount: number;
  color: Rgb;
}

/** A paint run (paint-drips.ts) starting at a texel's center, decided by whoever painted it. */
export interface DripOp extends At {
  kind: 'drip';
  /** Meters and meters per second: each client runs it at its own paint detail. */
  length: number;
  speed: number;
  rgb: Rgb;
}

export type PaintOp = StampOp | RollOp | DripOp;

export class PaintOps {
  constructor(
    private paint: PaintSystem,
    private drips: PaintDrips,
  ) {}

  /** Paint an op made elsewhere. Never logged, and never starts runs: whoever painted it decides those. */
  apply(op: PaintOp) {
    const s = this.paint.find(op.key);
    if (!s) return;
    if (op.kind === 'drip') this.drips.run(s, op);
    else this.paint.replay(s, op);
  }
}
