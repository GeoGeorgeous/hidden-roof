import type { Finish } from '../kit/finishes';
import type { V3 } from '../kit/pieces';

// The level as a file (levels/<name>.json, build mode's save, a session's HOST):
// its props and spawn; pickups and the city's overrides ride along (main.ts levelData).

export interface PropData {
  /**
   * Its id for good (level format 3): paint names surfaces by it (`p<id>#k`),
   * so a saved level keeps it through edits. Files without ids (format 2)
   * number props in file order.
   */
  id?: number;
  type: string;
  /** Its variant (PropDef.variants), for props that have them. */
  variant?: string;
  pos: V3;
  rot?: number;
  /** Per-instance setting (PropDef.adjust), e.g. floodlight tilt in degrees. */
  adjust?: number;
  /** Per-instance text (PropDef.text), e.g. a sign's words. */
  text?: string;
  /** Its wall finish (PropDef.finishes), when not its own look. */
  finish?: Finish;
  /** Mirrored left to right (a wall piece flipped with R in build mode). */
  mirror?: boolean;
}

export interface LevelData {
  /** 4: props keep their default variant even when it changes later (format 3 files: see kit/index.ts upgraded). */
  version: 2 | 3 | 4;
  spawn: { pos: V3; yaw: number };
  props: PropData[];
  /** It has paint of its own, levels/<name>.rhhpaint (save/level-paint.ts): P in build mode writes both. */
  paint?: boolean;
  /** Owned by other systems (pickups). */
  [extra: string]: unknown;
}
