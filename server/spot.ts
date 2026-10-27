import { PLAYER, SERVER } from '../src/config';
import type { LevelData } from '../src/level/level-data';
import { snapshotSpot } from '../src/net/snapshot';
import type { Spot } from '../src/net/protocol';

// Where a player last stood (session.ts keeps it, as what they carry): read from the state they send, and kept only if
// it's inside the level's range, so a bad snapshot never moves anyone but the one who sent it.

/** The box a player may stand in: the level's props and spawn, SERVER.spotMargin around, from PLAYER.killY up. */
export type Range = { min: [number, number, number]; max: [number, number, number] };

export function levelRange(level: LevelData): Range {
  const points = [level.spawn.pos, ...level.props.map((p) => p.pos)];
  const [x, y, z] = [0, 1, 2].map((i) => points.map((p) => p[i]));
  const m = SERVER.spotMargin;
  return { min: [Math.min(...x) - m, PLAYER.killY, Math.min(...z) - m], max: [Math.max(...x) + m, Math.max(...y) + m, Math.max(...z) + m] };
}

/** The spot a 'state' snapshot puts its sender at, or null if it's not inside `range` (or not numbers). */
export function spotIn(bytes: Uint8Array, range: Range): Spot | null {
  const s = snapshotSpot(bytes);
  return s.pos.every((v, i) => Number.isFinite(v) && v >= range.min[i] && v <= range.max[i]) ? s : null;
}
