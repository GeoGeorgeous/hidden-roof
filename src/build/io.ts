import type { LevelData } from '../level/level';

// Save a level as a downloaded JSON file; load one through a file picker.

export function downloadLevel(data: LevelData, name = 'level.json') {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Opens a file picker (releases the mouse). Resolves with the parsed level. */
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
        resolve(JSON.parse(await file.text()));
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
  return res.json();
}
