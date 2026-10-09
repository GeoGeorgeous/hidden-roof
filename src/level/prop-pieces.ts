import { defOf, renamed, upgraded } from '../kit';
import { mirrored, type Piece } from '../kit/pieces';
import type { SurfaceGeometry } from '../surfaces';
import { expandPieces, solidBoxes, type PropInstance } from './build-prop';
import { CoverIndex } from './cover';
import { computeJoints, jointPieces } from './joints';
import type { LevelData, PropData } from './level';
import { stackContext } from './stacks';

// From level data to props and their pieces, the same way on every client and
// on the server: prop ids, each prop's pieces, and a level's paint faces with
// their keys (PaintSurface.key), without building meshes or materials.

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

/** Every paint surface of a level as loaded (Level.load), by key, at the current PAINT.texelsPerMeter. */
export function levelPaintFaces(data: LevelData): { key: string; geo: SurfaceGeometry }[] {
  const props = new Map<number, PropInstance>();
  let next = 1;
  for (const p of data.props) {
    const inst = instanceOf(upgraded(p, data.version), next, (id) => props.has(id));
    if (!inst) continue;
    props.set(inst.id, inst);
    next = Math.max(next, inst.id + 1);
  }
  const out: { key: string; geo: SurfaceGeometry }[] = [];
  // As Level.load: every solid box listed first, so covered faces are decor here too.
  const pieces = new Map([...props.values()].map((inst) => [inst.id, propPieces(inst, props.values())]));
  const cover = new CoverIndex();
  for (const inst of props.values()) cover.set(inst.id, solidBoxes(pieces.get(inst.id)!, inst.pos, inst.rot));
  const add = (owner: string, pieces: Piece[], pos: PropInstance['pos'], rot: number) =>
    expandPieces(pieces, pos, rot, true, cover).paint.forEach(({ geo }, k) => out.push({ key: `${owner}#${k}`, geo }));
  for (const inst of props.values()) add(`p${inst.id}`, pieces.get(inst.id)!, inst.pos, inst.rot);
  for (const [key, joint] of computeJoints(props.values())) add(`j${key}`, jointPieces(joint), joint.pos, 0);
  return out;
}
