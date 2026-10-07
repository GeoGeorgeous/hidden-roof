import type { JointKind } from '../kit/def';
import { defOf } from '../kit';
import { M, Parts, type Piece, type V3 } from '../kit/pieces';
import { WALL_H } from '../kit/structure';
import type { PropInstance } from './build-prop';

// Joint posts at grid intersections where edge props (walls, parapets,
// railings) end. Derived from the placed props, never placed by hand, so runs
// and corners always close cleanly. Like Minecraft fences connecting.

const JOINTS: Record<JointKind, () => Piece[]> = {
  wall: () => {
    const p = new Parts();
    p.box([-0.15, 0, -0.15], [0.15, WALL_H, 0.15], M.plaster, { paint: true });
    return p.list;
  },
  parapet: () => {
    const p = new Parts();
    p.box([-0.15, 0, -0.15], [0.15, 1.02, 0.15], M.concrete, { paint: true });
    p.box([-0.2, 1.02, -0.2], [0.2, 1.1, 0.2], M.galv, { paint: true });
    return p.list;
  },
  railing: () => {
    const p = new Parts();
    p.detail([-0.03, 0, -0.03], [0.03, 1.1, 0.03], M.steel);
    return p.list;
  },
};

export interface Joint {
  key: string;
  kind: JointKind;
  pos: V3;
}

/** All joints needed by the current edge props. */
export function computeJoints(props: Iterable<PropInstance>): Map<string, Joint> {
  const out = new Map<string, Joint>();
  for (const inst of props) {
    const kind = defOf(inst.type, inst.variant)?.joint;
    if (!kind) continue;
    const alongX = inst.rot % 2 === 0;
    for (const s of [-1, 1]) {
      const pos: V3 = [inst.pos[0] + (alongX ? s : 0), inst.pos[1], inst.pos[2] + (alongX ? 0 : s)];
      const key = `${kind}|${pos.map((v) => v.toFixed(2)).join('|')}`;
      if (!out.has(key)) out.set(key, { key, kind, pos });
    }
  }
  return out;
}

export function jointPieces(kind: JointKind) {
  return JOINTS[kind]();
}
