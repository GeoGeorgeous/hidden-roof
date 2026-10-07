import type { Piece, V3 } from './pieces';
import type { Finish, FinishKind } from './finishes';

// Prop definitions for the grid editor.
//
// Grid: 2 m horizontal module, 4 m vertical module; small props snap to 0.5 m.
// Conventions for builders: origin at the bottom (or the top surface for
// `anchorTop` props), centered; front faces -z. Mount props have their back on
// z = 0 (the wall face) and extend toward -z.

export const H_MODULE = 2;
export const V_MODULE = 4;

export type Category = 'structure' | 'scaffold' | 'access' | 'barriers' | 'hvac' | 'pipes' | 'cables' | 'rooftop' | 'signs' | 'neon' | 'lights' | 'level' | 'pickups';
export const CATEGORIES: Category[] = ['structure', 'scaffold', 'access', 'barriers', 'hvac', 'pipes', 'cables', 'rooftop', 'signs', 'neon', 'lights', 'level', 'pickups'];

/**
 * How a prop snaps:
 * - cell:   fills grid cells (footprint in meters, multiples of 2)
 * - edge:   centered on a grid line, 1.7 m long (walls, parapets, railings)
 * - mount:  back on the wall face you aim at, facing out (ladders, signs)
 * - floor:  stands on any surface, 0.5 m snap (equipment, details)
 */
type Placement = 'cell' | 'edge' | 'mount' | 'floor';

/** Posts generated where edge props meet (see level/joints.ts). */
export type JointKind = 'wall' | 'parapet' | 'railing' | 'parapetRail' | 'fence';

interface PropContext {
  /** Stable per-instance number for variations. */
  seed: number;
  /** World position (some props vary with height, e.g. fire escape lanes). */
  pos: V3;
  /** Stacking props: is the same prop directly above (one level up) / anywhere below in this column? */
  above: boolean;
  below: boolean;
  /** This instance's value for PropDef.adjust (its default when never adjusted). */
  adjust: number;
  /** This instance's text (PropDef.text), or its default. */
  text: string;
  /** This instance's wall and floor finishes (PropDef.finishes); none: its own look. */
  finish?: Finish;
}

/** One per-instance setting changed in build mode with [ and ] (e.g. floodlight tilt, platform height). */
interface PropAdjust {
  label: string;
  /** Shown after the value: '°' (default) or ' M'. */
  unit?: string;
  min: number;
  max: number;
  step: number;
  /** Value for instances never adjusted (may read config). */
  initial: () => number;
}

export interface PropDef {
  type: string;
  label: string;
  category: Category;
  place: Placement;
  /** Horizontal snap step. */
  snap: number;
  /** Cell footprint in meters (local x, z). Default 2 x 2. */
  footprint?: [number, number];
  /** Cell props whose origin is their top surface (building block, floor slab). */
  anchorTop?: boolean;
  /** Mount props: snap the base height to this step (ladder, fire escape: 4). Cell props: stack by this step instead of 4 m (half block: 2). */
  vSnap?: number;
  /** Mount props hung at the aim point (signs, cables): base = aim height - hang. */
  hang?: number;
  joint?: JointKind;
  /**
   * Stacking props whose shape depends on the same prop one level above
   * (ctx.above: vSnap higher, else 4 m) or anywhere below in the same column
   * (ctx.below). They are rebuilt when that changes. Only the same variant
   * counts, unless `across` (scaffolding bays with railings on other ends).
   */
  stacks?: { above?: boolean; below?: boolean; across?: boolean };
  adjust?: PropAdjust;
  /** Props that show a text of their own (signs): its default. Typed in build mode (Enter), saved per instance. */
  text?: string;
  /** Surfaces whose finish can be chosen (kit/finishes.ts): its walls, its floor. */
  finishes?: FinishKind[];
  /** Its variants, the first being the default (see Variant). */
  variants?: Variant[];
  /** A def resolved by defOf (kit/index.ts): the variant merged into it. */
  variant?: string;
  build(ctx: PropContext): Piece[];
}

/**
 * One look of a prop: a color, a length, a size, a piece of a modular run.
 * It overrides the prop's fields where it differs (another build, a wall
 * mount instead of the floor, its own default text). Saved per instance as
 * its id (PropData.variant).
 */
export interface Variant extends Partial<Omit<PropDef, 'type' | 'label' | 'category' | 'variants' | 'variant' | 'build'>>, Pick<PropDef, 'build'> {
  id: string;
  label: string;
}

/** A prop made of variants: the fields they share, and each variant's own. */
export function withVariants(shared: Omit<PropDef, 'variants' | 'variant' | 'build'>, variants: Variant[]): PropDef {
  return { ...shared, variants, build: variants[0].build };
}
