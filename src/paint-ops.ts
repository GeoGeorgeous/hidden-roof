import * as THREE from 'three';
import type { PaintSystem, Rgb } from './painting';
import type { FacePoint } from './surfaces';

// Paint operations: each stamp and roll the tools make, as data. A surface by
// key and a face point (u, v across the face) are the same on every client
// and at every paint detail, so a recorded op paints the same spot anywhere.
// PaintSystem.log records the local ones; apply() replays an op from elsewhere
// (another player, a save, the loopback test).

interface At {
  /** Surface key (PaintSurface.key) and face point. */
  key: string;
  rect: number;
  u: number;
  v: number;
}

interface StampOp extends At {
  kind: 'stamp';
  radius: number;
  amount: number;
  color: Rgb | null;
  softness: number;
  square: boolean;
}

interface RollOp extends At {
  kind: 'roll';
  axis: [number, number, number];
  halfLength: number;
  halfWidth: number;
  edge: number;
  amount: number;
  color: Rgb;
}

export type PaintOp = StampOp | RollOp;

const at: FacePoint = { rect: 0, u: 0, v: 0 };
const axis = new THREE.Vector3();

export class PaintOps {
  constructor(private paint: PaintSystem) {}

  /** Paint an op made elsewhere. Never logged, and never starts runs: whoever painted it decides those. */
  apply(op: PaintOp) {
    const s = this.paint.find(op.key);
    if (!s) return;
    at.rect = op.rect;
    at.u = op.u;
    at.v = op.v;
    const log = this.paint.log;
    this.paint.log = null;
    if (op.kind === 'stamp') this.paint.stamp(s, at, op.radius, op.amount, op.color, op.softness, 0, op.square);
    else this.paint.roll(s, at, axis.fromArray(op.axis), op.halfLength, op.halfWidth, op.edge, op.amount, op.color, 0);
    this.paint.log = log;
  }
}
