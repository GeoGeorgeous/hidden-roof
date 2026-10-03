import type { Piece, V3 } from './pieces';

// Prop definitions for the grid editor.
//
// Grid: 2 m horizontal module, 4 m vertical module; small props snap to 0.5 m.
// Conventions for builders: origin at the bottom (or the top surface for
// `anchorTop` props), centered; front faces -z. Mount props have their back on
// z = 0 (the wall face) and extend toward -z.

export const H_MODULE = 2;
export const V_MODULE = 4;

export type Category = 'structure' | 'access' | 'equipment' | 'details' | 'lights' | 'pickups';
export const CATEGORIES: Category[] = ['structure', 'access', 'equipment', 'details', 'lights', 'pickups'];

/**
 * How a prop snaps:
 * - cell:   fills grid cells (footprint in meters, multiples of 2)
 * - edge:   centered on a grid line, 2 m long (walls, parapets, railings)
 * - vertex: on a grid intersection (corners)
 * - mount:  back on the wall face you aim at, facing out (ladders, signs)
 * - floor:  stands on any surface, 0.5 m snap (equipment, details)
 */
export type Placement = 'cell' | 'edge' | 'vertex' | 'mount' | 'floor';

/** Posts generated where edge props meet (see level/joints.ts). */
export type JointKind = 'wall' | 'parapet' | 'railing';

export interface PropContext {
  /** Stable per-instance number for variations. */
  seed: number;
  /** World position (some props vary with height, e.g. fire escape lanes). */
  pos: V3;
  /** Stacking props: is the same prop directly above (one level up) / anywhere below in this column? */
  above: boolean;
  below: boolean;
  /** This instance's value for PropDef.adjust (its default when never adjusted). */
  adjust: number;
}

/** One per-instance setting changed in build mode with [ and ] (e.g. floodlight tilt). */
export interface PropAdjust {
  label: string;
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
  /** Mount props: snap the base height to this step (ladder, fire escape: 4). */
  vSnap?: number;
  /** Mount props hung at the aim point (signs, cables): base = aim height - hang. */
  hang?: number;
  joint?: JointKind;
  /**
   * Stacking props whose shape depends on the same prop one level above
   * (ctx.above) or anywhere below in the same column (ctx.below). They are
   * rebuilt when that changes.
   */
  stacks?: { above?: boolean; below?: boolean };
  adjust?: PropAdjust;
  build(ctx: PropContext): Piece[];
}
