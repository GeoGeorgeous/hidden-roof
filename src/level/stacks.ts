import { V_MODULE, type PropDef } from '../kit/def';
import type { V3 } from '../kit/pieces';
import type { PropInstance } from './build-prop';

// Which placed props are "the same prop" as a def, in a column or at a spot:
// the stacking props' neighbors (PropDef.stacks: a block on a block, a ladder
// on a ladder) and a copy already standing where another would go.

/** Is a prop of this def's type and variant, or any variant with `stacks.across` (stacking only joins the same prop)? */
const isA = (p: PropInstance, def: PropDef) => p.type === def.type && (!!def.stacks?.across || p.variant === def.variant);

/** Cell props fill the same space whatever their facing, so their rotation doesn't matter. */
const sameFacing = (p: PropInstance, def: PropDef, rot: number) => def.place === 'cell' || p.rot === rot;

/** Props like `def` in the same vertical column as `pos` (same x, z). */
export function column(props: Iterable<PropInstance>, def: PropDef, pos: V3, rot: number) {
  return [...props].filter((p) => isA(p, def) && sameFacing(p, def, rot) && Math.abs(p.pos[0] - pos[0]) < 0.01 && Math.abs(p.pos[2] - pos[2]) < 0.01);
}

/** The prop like `def` at `pos`, if one stands there. */
export function propAt(props: Iterable<PropInstance>, def: PropDef, pos: V3, rot: number) {
  for (const p of props) if (isA(p, def) && sameFacing(p, def, rot) && pos.every((v, i) => Math.abs(v - p.pos[i]) < 0.01)) return p;
  return undefined;
}

/** Stacking neighbors (PropContext.above / below) of a prop like `def` (resolved by defOf) at `pos`. */
export function stackContext(props: Iterable<PropInstance>, def: PropDef, pos: V3, rot: number) {
  const all = [...props]; // looked through twice: an iterator would be spent after the first
  const above = !!def.stacks?.above && propAt(all, def, [pos[0], pos[1] + (def.vSnap ?? V_MODULE), pos[2]], rot) !== undefined;
  const below = !!def.stacks?.below && column(all, def, pos, rot).some((p) => p.pos[1] < pos[1] - 0.01);
  return { above, below };
}
