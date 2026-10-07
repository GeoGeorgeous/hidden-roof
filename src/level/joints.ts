import type { JointKind } from '../kit/def';
import { defOf } from '../kit';
import { finishOf, type Finish } from '../kit/finishes';
import { M, Parts, type Piece, type V3 } from '../kit/pieces';
import { WALL_H } from '../kit/structure';
import type { PropInstance } from './build-prop';

// Joint posts at grid intersections where edge props (walls, parapets,
// railings, fences) end. Derived from the placed props, never placed by hand, so runs
// and corners always close cleanly. Like Minecraft fences connecting.

/** Posts by kind; wall and parapet posts take the wall finish of the prop they were made for. */
const JOINTS: Record<JointKind, (finish?: Finish) => Piece[]> = {
  wall: (finish) => {
    const p = new Parts();
    p.box([-0.15, 0, -0.15], [0.15, WALL_H, 0.15], finishOf(finish, 'wall', M.plaster), { paint: true });
    return p.list;
  },
  parapet: (finish) => {
    const p = new Parts();
    p.box([-0.15, 0, -0.15], [0.15, 1.02, 0.15], finishOf(finish, 'wall', M.concrete), { paint: true });
    p.box([-0.2, 1.02, -0.2], [0.2, 1.1, 0.2], M.galv, { paint: true });
    return p.list;
  },
  railing: () => {
    const p = new Parts();
    p.detail([-0.03, 0, -0.03], [0.03, 1.1, 0.03], M.steel);
    return p.list;
  },
  /** Railing on a parapet: a post bolted onto the coping (1.1 m). */
  parapetRail: () => {
    const p = new Parts();
    p.detail([-0.08, 1.1, -0.08], [0.08, 1.12, 0.08], M.steel, false);
    p.detail([-0.03, 1.12, -0.03], [0.03, 2.2, 0.03], M.steel);
    return p.list;
  },
  /** Chain-link fence: a round post with a cap. */
  fence: () => {
    const p = new Parts();
    p.cyl([0, 0, 0], 'y', 2, 0.04, M.galv, { paint: false, seg: 8 });
    p.cyl([0, 2, 0], 'y', 0.05, 0.05, M.galv, { paint: false, collide: false, seg: 8 });
    return p.list;
  },
};

export interface Joint {
  key: string;
  kind: JointKind;
  pos: V3;
  /** The finish of the first prop (in placing order) that needs this joint. */
  finish?: Finish;
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
      if (!out.has(key)) out.set(key, { key, kind, pos, finish: inst.finish });
    }
  }
  return out;
}

export function jointPieces(joint: Joint) {
  return JOINTS[joint.kind](joint.finish);
}

/** Do two joints look the same (the same finish)? */
export const sameFinish = (a: Joint, b: Joint) => a.finish?.wall === b.finish?.wall;
