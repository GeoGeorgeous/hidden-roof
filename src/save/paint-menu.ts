import type { Hud } from '../hud';
import type { Level } from '../level/level';
import type { PaintDrips } from '../paint-drips';
import type { PaintSystem } from '../painting';
import { download, pickFile, stamp } from '../files';
import { levelHash } from './level-hash';
import { loadPaint } from './load-paint';
import { savePaint } from './save-paint';

// SAVE PAINT and LOAD PAINT in the menu: the paint of this level as a file
// download, and a file put back. Returns the two, for tests.

/** `levelName`: the current level's name (it changes when build mode opens another). */
export function paintMenu(hud: Hud, paint: PaintSystem, drips: PaintDrips, level: Level, levelName: () => string) {
  const info = () => ({ name: levelName(), hash: levelHash(level) });
  const file = {
    save: () => savePaint(paint, info()),
    load: (bytes: Uint8Array) => loadPaint(paint, drips, bytes, info()),
  };
  // One at a time: clicks while a save or a load runs (or its file picker is open) do nothing.
  let busy = false;
  const oneAtATime = (run: () => Promise<void>) => async () => {
    if (busy) return;
    busy = true;
    try {
      await run();
    } catch (e) {
      hud.notice((e as Error).message);
    } finally {
      busy = false;
    }
  };
  hud.onSavePaint = oneAtATime(async () => {
    hud.notice('Saving paint…', Infinity);
    download(new Blob([(await file.save()) as BlobPart]), `${levelName()}-${stamp(new Date())}.rhhpaint`);
    hud.notice('Paint saved');
  });
  hud.onLoadPaint = oneAtATime(async () => {
    const picked = await pickFile('.rhhpaint');
    hud.notice('Loading paint…', Infinity);
    const { missing } = await file.load(new Uint8Array(await picked.arrayBuffer()));
    hud.notice(missing ? `Paint loaded (${missing} faces skipped)` : 'Paint loaded');
  });
  return file;
}
