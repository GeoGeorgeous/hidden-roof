import { defOf, renamed } from '../kit';
import { mirrored, type Piece } from '../kit/pieces';
import type { PropInstance } from './build-prop';
import type { PropData } from './level';
import { stackContext } from './stacks';

// From level data to props and their pieces, the same way everywhere: prop ids
// and each prop's pieces.

/** The instance for `data`: its own id when free (a format 3 level, undo), else `next`. Null for an unknown type. */
export function instanceOf(data: PropData, next: number, taken: (id: number) => boolean): PropInstance | null {
  // Levels saved before variants name some props by their old types.
  const [type, variant] = renamed(data.type, data.variant);
  const def = defOf(type, variant);
  if (!def) {
    console.warn(`unknown prop type "${data.type}"`);
    return null;
  }
  const id = Number.isInteger(data.id) && data.id! > 0 && !taken(data.id!) ? data.id! : next;
  return { id, type, variant: def.variant, pos: [...data.pos], rot: (((data.rot ?? 0) % 4) + 4) % 4, adjust: data.adjust, text: data.text, finish: data.finish, mirror: data.mirror || undefined };
}

/** A prop's pieces, as its def builds them where it stands (`props`: its stacking neighbors among them). */
export function propPieces(inst: PropInstance, props: Iterable<PropInstance>): Piece[] {
  const def = defOf(inst.type, inst.variant)!;
  const seed = Math.abs(Math.round(inst.pos[0] * 7 + inst.pos[2] * 13));
  const adjust = inst.adjust ?? def.adjust?.initial() ?? 0;
  const ctx = { seed, pos: inst.pos, rot: inst.rot, adjust, text: inst.text ?? def.text ?? '', finish: inst.finish, ...stackContext(props, def, inst.pos, inst.rot) };
  return inst.mirror ? mirrored(def.build(ctx)) : def.build(ctx);
}
