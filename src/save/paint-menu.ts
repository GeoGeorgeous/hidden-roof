import { download, pickFile, stamp } from '../files';
import { aboutSize, action, button, fileChip, hl, para, popup, relabel, sentence } from '../menu-ui';
import type { PaintDrips } from '../paint-drips';
import type { PaintSystem } from '../painting';
import type { PauseMenu } from '../pause-menu';
import { session } from '../session';
import { loadPaint, NotThisLevel } from './load-paint';
import { decodePaintFile, type DecodedPaint } from './paint-file';
import { savePaint } from './save-paint';

// The ESC menu's SAVE and UPLOAD popups: the paint of this level as a file
// download, and a file put back. SAVE packs the paint as it opens, to show
// the file's size (in a session the server packs it, on DOWNLOAD:
// `sessionSave`). UPLOAD checks the file it's given before anything is
// replaced. Returns the save and load, for tests.

export function paintMenu(menu: PauseMenu, paint: PaintSystem, drips: PaintDrips, levelName: () => string, sessionSave: () => Promise<Uint8Array>) {
  const info = () => ({ name: levelName() });
  const file = {
    save: () => (session.multiplayer ? sessionSave() : savePaint(paint, info())),
    load: (bytes: Uint8Array | DecodedPaint) => loadPaint(paint, drips, bytes, info()),
    check: (bytes: Uint8Array | DecodedPaint) => loadPaint(paint, drips, bytes, info(), undefined, false),
  };
  const backToRoof = () => action('Back to the roof', () => menu.onResume(), { primary: true, key: 'ESC' });
  const cancel = () => action('Cancel', () => menu.openPage(null), { key: 'ESC' });

  // SAVE: packed as it opens (not in a session), downloaded once.
  const save = popup('save paint');
  let name = '';
  let packed: Promise<Uint8Array> | null = null;
  let saving = false;
  const openSave = () => {
    name = `${levelName()}-${stamp(new Date())}.rhhpaint`;
    saving = false;
    const chip = fileChip(name, session.multiplayer ? 'from the session' : 'packing…');
    const pack = (packed = session.multiplayer ? null : file.save());
    pack?.then(
      (bytes) => pack === packed && (chip.lastChild!.textContent = aboutSize(bytes.length)),
      () => {},
    );
    const go = action('Download', async () => {
      if (saving) return;
      saving = true;
      relabel(go, 'Saving…');
      try {
        const bytes = await (packed ?? file.save());
        download(new Blob([bytes as BlobPart]), name);
        save.body.replaceChildren(para('lead done', 'Download started.'), para('', 'Look for ', hl(name), ' in your Downloads folder. Upload it from this menu whenever you want to pick up where you left off.'));
        save.buttons.replaceChildren(backToRoof());
      } catch (e) {
        saving = false;
        relabel(go, 'Download');
        save.body.querySelector('.error')?.remove();
        save.body.append(para('error', sentence((e as Error).message)));
      }
    }, { primary: true });
    save.body.replaceChildren(
      para('lead', 'This downloads one file to your computer:'),
      chip,
      para('', 'It holds every mark you’ve made on this roof. Nothing is kept online, so put it somewhere safe.'),
      para('', 'To keep painting later, open this menu, choose ', hl('Paint → Upload'), ' and pick the file.'),
    );
    save.buttons.replaceChildren(cancel(), go);
  };
  menu.addPage('save', save.root, openSave);

  // UPLOAD: pick, check, replace.
  const upload = popup('upload paint');
  let picking = false;
  const pick = async () => {
    if (picking) return;
    picking = true;
    let picked: File;
    try {
      picked = await pickFile('.rhhpaint');
    } catch {
      return;
    } finally {
      picking = false;
    }
    const bytes = new Uint8Array(await picked.arrayBuffer());
    const saved = new Date(picked.lastModified).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const chip = () => fileChip(picked.name, `saved ${saved} · ${aboutSize(picked.size)}`);
    const failed = (e: unknown) => {
      const fits = !(e instanceof NotThisLevel);
      upload.body.replaceChildren(
        chip(),
        para('lead error', fits ? `${sentence((e as Error).message)}.` : 'That paint file doesn’t fit this level.'),
        para('', fits ? 'Pick a file you saved with Paint → Save.' : 'It was saved on a different roof, so the walls don’t line up. Pick a file saved here, or start fresh.'),
      );
      upload.buttons.replaceChildren(cancel(), action('Pick another', pick, { primary: true }));
    };
    let decoded: DecodedPaint;
    try {
      decoded = await decodePaintFile(bytes);
      await file.check(decoded);
    } catch (e) {
      return failed(e);
    }
    upload.body.replaceChildren(chip(), para('', 'The paint on this roof will be replaced with the paint in this file. This can’t be undone.'));
    const replace = action('Replace paint', async () => {
      try {
        const { skipped } = await file.load(decoded);
        upload.body.replaceChildren(
          para('lead done', 'Paint loaded.'),
          para('', 'Everything from ', hl(picked.name), ` is back on the walls${skipped ? `, but ${skipped} faces changed since and stay clean` : ''}. Pick up where you left off.`),
        );
        upload.buttons.replaceChildren(backToRoof());
      } catch (e) {
        failed(e);
      }
    }, { primary: true });
    upload.buttons.replaceChildren(action('Pick another', pick), replace);
  };
  const openUpload = () => {
    upload.body.replaceChildren(
      para('lead', 'Pick a ', hl('.rhhpaint'), ' file you saved earlier to bring your paint back onto this roof.'),
      para('', 'It replaces the paint that’s here now. If you want to keep it, save it first.'),
    );
    // Nothing to save on the title screen.
    const first = button('Save current paint first', () => menu.openPage('save'), 'link');
    first.hidden = !menu.started;
    upload.buttons.replaceChildren(first, cancel(), action('Choose file…', pick, { primary: true }));
  };
  menu.addPage('upload', upload.root, openUpload);
  return file;
}
