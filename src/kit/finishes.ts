import { M, type Mat } from './pieces';

// Wall finishes of the structure pieces (blocks, walls, parapets, plinths):
// their own look, or brick (textures.ts). Chosen in build mode (F), saved per
// piece (PropData.finish). A piece without one keeps its own look.

export type FinishKind = 'wall';

export interface Finish {
  wall?: string;
}

export const FINISHES: Record<FinishKind, Record<string, Mat>> = {
  wall: { brick: M.brick },
};

/** The material of a piece's `kind` surfaces: its finish, else its own (`own`). */
export const finishOf = (f: Finish | undefined, kind: FinishKind, own: Mat) => FINISHES[kind][f?.[kind] ?? ''] ?? own;
