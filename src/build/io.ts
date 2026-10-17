import { levelProblem, type LevelData } from '../level/level-data';
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

/** `data` as a level, or an error naming what's wrong with it. Unknown prop types still load (they're skipped with a warning). */
function checkLevel(data: unknown): LevelData {
  const problem = levelProblem(data);
  if (problem) throw new Error(`NOT A LEVEL FILE (${problem})`);
  return data as LevelData;
}
