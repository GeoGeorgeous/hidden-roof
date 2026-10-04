import type { LevelData } from '../level/level';

// Save a level as a downloaded JSON file; load one through a file picker.
// Loaded levels are checked before anything is replaced: a broken file is
// rejected and the current level (and its undo history) stays as it was.

export function downloadLevel(data: LevelData, name = 'level.json') {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Opens a file picker (releases the mouse). Resolves with the checked level. */
export function pickLevelFile(): Promise<LevelData> {
  document.exitPointerLock();
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error('no file'));
      try {
        resolve(checkLevel(JSON.parse(await file.text())));
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}

export async function fetchLevel(name: string): Promise<LevelData> {
  const res = await fetch(`${import.meta.env.BASE_URL}levels/${name}.json`);
  if (!res.ok) throw new Error(`level ${name}: ${res.status}`);
  return checkLevel(await res.json());
}

const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const isV3 = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(isNum);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isProp = (p: unknown) => isObj(p) && typeof p.type === 'string' && isV3(p.pos) && (p.rot === undefined || isNum(p.rot)) && (p.adjust === undefined || isNum(p.adjust));
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
