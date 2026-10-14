import type { Finish } from '../kit/finishes';
import type { V3 } from '../kit/pieces';

// The level as a file (levels/<name>.json, build mode's save, a session's HOST):
// its props and spawn; pickups and the city's overrides ride along (main.ts levelData).
// levelProblem checks one, for the game and the server alike. No runtime imports:
// Node runs this file as is (net/protocol.ts, scripts/protocol.test.mjs).

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

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isV3 = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(isNum);
const optional = (v: unknown, is: (v: unknown) => boolean) => v === undefined || is(v);
const isProp = (p: unknown) =>
  isObj(p) &&
  typeof p.type === 'string' &&
  isV3(p.pos) &&
  optional(p.id, (v) => Number.isInteger(v) && (v as number) > 0) &&
  // Quarter turns: Level.load reads any whole number, never a fraction.
  optional(p.rot, Number.isInteger) &&
  optional(p.variant, (v) => typeof v === 'string') &&
  optional(p.adjust, isNum) &&
  optional(p.text, (v) => typeof v === 'string') &&
  optional(p.finish, (v) => isObj(v) && Object.values(v).every((x) => typeof x === 'string')) &&
  optional(p.mirror, (v) => typeof v === 'boolean');
const isPickup = (p: unknown) => isObj(p) && typeof p.kind === 'string' && isV3(p.pos);

/**
 * What's wrong with `d` as a level (a file opened, fetched, or a HOST's), or
 * null; `maxProps`: the most props it may have. Unknown prop types pass: Level.load
 * skips them with a warning.
 */
export function levelProblem(d: unknown, maxProps = Infinity): string | null {
  if (!isObj(d)) return 'NOT AN OBJECT';
  if (!isObj(d.spawn) || !isV3(d.spawn.pos) || !isNum(d.spawn.yaw)) return 'BAD SPAWN';
  if (!Array.isArray(d.props) || d.props.length > maxProps || !d.props.every(isProp)) return 'BAD PROPS';
  if (!optional(d.pickups, (v) => Array.isArray(v) && v.every(isPickup))) return 'BAD PICKUPS';
  if (!optional(d.paint, (v) => typeof v === 'boolean')) return 'BAD PAINT';
  return null;
}
