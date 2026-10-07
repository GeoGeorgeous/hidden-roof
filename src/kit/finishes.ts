import { M, type Mat } from './pieces';

// Wall and floor finishes of the structure pieces (blocks, walls, parapets,
// slabs), each its own base texture (textures.ts): chosen in build mode (F,
// G), saved per piece (PropData.finish). A piece without one keeps its own look.

export type FinishKind = 'wall' | 'floor';

export interface Finish {
  wall?: string;
  floor?: string;
}

export const FINISHES: Record<FinishKind, Record<string, Mat>> = {
  wall: { panel: M.plaster, plaster: M.stucco, brick: M.brick },
  floor: { panel: M.roof, pavers: M.pavers },
};

/** The material of a piece's `kind` surfaces: its finish, else its own (`own`). */
export const finishOf = (f: Finish | undefined, kind: FinishKind, own: Mat) => FINISHES[kind][f?.[kind] ?? ''] ?? own;
