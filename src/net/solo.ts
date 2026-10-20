import { PAINT } from '../config';
import type { LevelData } from '../level/level-data';
import { hasPaint } from '../paint-surface';
import { loadPaint } from '../save/load-paint';
import { savePaint } from '../save/save-paint';
import type { MultiplayerContext } from './game-context';

// The player's own game while a session has its level and paint: kept as a
// level and one paint file (nothing else, nothing on the GPU) when the welcome
// is about to replace them, and put back when the session ends.

export interface Solo {
  data: LevelData;
  name: string;
  /** Their paint as a paint file, null when there was none. */
  paint: Uint8Array | null;
}

/** The open level and its paint, kept. The paint is read at once: what lands after it isn't in the file. */
export async function keepSolo(g: MultiplayerContext): Promise<Solo> {
  const { data, name } = g.levelData();
  return { data, name, paint: [...g.paint.surfaces].some(hasPaint) ? await savePaint(g.paint, { name }) : null };
}

/** The kept level from its spawn at the player's own PAINT DETAIL, with the paint it had; the session's is gone, free again. */
export async function restoreSolo(g: MultiplayerContext, solo: Solo) {
  const built = g.paint.texelsPerMeter;
  g.ownDetail();
  const open = g.levelData();
  if (built === PAINT.texelsPerMeter && open.name === solo.name && JSON.stringify(open.data) === JSON.stringify(solo.data)) g.restartLevel();
  else g.openLevel(solo.data, solo.name);
  if (solo.paint) await loadPaint(g.paint, g.drips, solo.paint, { name: solo.name });
}
