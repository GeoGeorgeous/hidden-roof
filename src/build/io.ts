import type { LevelData } from '../level/level';
import { download, pickFile } from '../files';

// Save a level as a downloaded JSON file; load one through a file picker.
// Loaded levels are checked before anything is replaced: a broken file is
// rejected and the current level (and its undo history) stays as it was.

export function downloadLevel(data: LevelData, name = 'level.json') {
  download(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), name);
}

/** Opens a file picker (releases the mouse). Resolves with the checked level and its name (the file's, without .json). */
export async function pickLevelFile(): Promise<{ data: LevelData; name: string }> {
  const file = await pickFile('.json,application/json');
  return { data: checkLevel(JSON.parse(await file.text())), name: file.name.replace(/\.json$/i, '') };
}

export async function fetchLevel(name: string): Promise<LevelData> {
  const res = await fetch(`${import.meta.env.BASE_URL}levels/${name}.json`);
  if (!res.ok) throw new Error(`level ${name}: ${res.status}`);
  return checkLevel(await res.json());
}

const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const isV3 = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(isNum);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isProp = (p: unknown) => isObj(p) && (p.id === undefined || (Number.isInteger(p.id) && (p.id as number) > 0)) && typeof p.type === 'string' && (p.variant === undefined || typeof p.variant === 'string') && isV3(p.pos) && (p.rot === undefined || isNum(p.rot)) && (p.adjust === undefined || isNum(p.adjust)) && (p.text === undefined || typeof p.text === 'string') && (p.mirror === undefined || typeof p.mirror === 'boolean') && (p.finish === undefined || (isObj(p.finish) && Object.values(p.finish).every((v) => typeof v === 'string')));
const isPickup = (p: unknown) => isObj(p) && typeof p.kind === 'string' && isV3(p.pos);

/** `data` as a level, or an error naming what's wrong with it. Unknown prop types still load (they're skipped with a warning). */
function checkLevel(data: unknown): LevelData {
  const problem = levelProblem(data);
  if (problem) throw new Error(`NOT A LEVEL FILE (${problem})`);
  return data as LevelData;
}

function levelProblem(d: unknown) {
  if (!isObj(d)) return 'NOT AN OBJECT';
  if (!isObj(d.spawn) || !isV3(d.spawn.pos) || !isNum(d.spawn.yaw)) return 'BAD SPAWN';
  if (!Array.isArray(d.props) || !d.props.every(isProp)) return 'BAD PROPS';
  if (d.pickups !== undefined && !(Array.isArray(d.pickups) && d.pickups.every(isPickup))) return 'BAD PICKUPS';
  return null;
}
