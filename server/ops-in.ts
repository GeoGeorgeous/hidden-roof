import type { Tool } from '../src/inventory/tool';
import { encodeOps, type SurfaceIndex } from '../src/op-wire';
import { opTool, type PaintOp } from '../src/paint-ops';
import { stampedBy, type Player } from './player';
import type { sessionPaint } from './world';

/**
 * The paint ops of a batch `p` sent (`batch`, read from `bytes`) that a session takes, and the batch as it goes on to
 * the others. Ops on a face their surface doesn't have, and ops of a tool the session turned off (`off`), are dropped; a
 * time ahead of the clock they run since they joined is cut (a far-future time would make every game hold the op until
 * then). The bytes are the ones sent when nothing changed.
 */
export function takenOps(batch: { t: number[]; ops: PaintOp[] }, bytes: Uint8Array, p: Player, paint: ReturnType<typeof sessionPaint>['paint'], off: ReadonlySet<Tool>, surfaces: SurfaceIndex) {
  const keep = batch.ops.map((op) => {
    const tool = opTool(op);
    return op.rect < (paint.find(op.key)?.geo.rects.length ?? 0) && !(tool && off.has(tool));
  });
  const ops = batch.ops.filter((_, i) => keep[i]);
  const t = batch.t.map((x) => stampedBy(p, x));
  const same = ops.length === batch.ops.length && t.every((x, i) => x === batch.t[i]);
  return { ops, bytes: same ? bytes : encodeOps(t.filter((_, i) => keep[i]), ops, surfaces) };
}
