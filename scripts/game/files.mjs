// Game tests: The save and upload popups, COPY NETWORK LOG, the NAME field's cleaning and HOST without a name, and paint saves through level edits and spray at LOAD.
import fs from 'node:fs';
import { gameReady } from '../test-browser.mjs';
import { page, check, openPage, dot, paintedKeys, POPUP, SAVE, UPLOAD, tmp } from './harness.mjs';

await check('save popup: SAVE shows the file and its size; DOWNLOAD downloads that one file, even clicked three times at once, then says where it went', async () => {
  await dot(page);
  await page.click(SAVE);
  await page.waitForFunction(() => /KB|MB/.test(document.querySelector('.popup-page:not([hidden]) .chip span').textContent));
  const chip = await page.textContent(`${POPUP} .chip b`);
  let n = 0;
  const count = () => n++;
  page.on('download', count);
  const first = page.waitForEvent('download');
  await page.evaluate((popup) => { const go = document.querySelector(`${popup} .btn.primary`); for (let i = 0; i < 3; i++) go.click(); }, POPUP);
  const saved = await first;
  await saved.saveAs(`${tmp}/menu.rhhpaint`);
  await page.waitForFunction((popup) => document.querySelector(`${popup} .para.done`)?.textContent === 'Download started.', POPUP);
  await page.waitForTimeout(300);
  page.off('download', count);
  const back = await page.evaluate(() => (window.game.hud.menu.goBack(), document.querySelector('.overlay .pause').hidden));
  return n === 1 && /^demo-\d{8}-\d{6}\.rhhpaint$/.test(chip) && saved.suggestedFilename() === chip && !back ? null : JSON.stringify({ n, chip, file: saved.suggestedFilename(), back });
});

await check('upload popup: with the file picker open, CHOOSE FILE does nothing; closing the picker leaves the popup as it was', async () => {
  await page.click(UPLOAD);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${POPUP} .btn.primary`)]);
  let extra = 0;
  const count = () => extra++;
  page.on('filechooser', count);
  await page.evaluate((popup) => document.querySelector(`${popup} .btn.primary`).click(), POPUP);
  await page.waitForTimeout(300);
  page.off('filechooser', count);
  await chooser.setFiles([]);
  await page.waitForTimeout(300);
  const still = await page.textContent(`${POPUP} .btn.primary`);
  await page.evaluate(() => window.game.hud.menu.goBack());
  return !extra && still === 'Choose file…ENTER' ? null : JSON.stringify({ extra, still });
});

await check('upload popup: after a reload, a saved file shows by name, and REPLACE PAINT puts its paint back', async () => {
  const before = await paintedKeys(page);
  await page.reload();
  await gameReady(page, 2);
  await page.click(UPLOAD);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${POPUP} .btn.primary`)]);
  await chooser.setFiles(`${tmp}/menu.rhhpaint`);
  await page.waitForFunction((popup) => document.querySelector(`${popup} .btn.primary`).textContent.startsWith('Replace paint'), POPUP);
  const chip = await page.textContent(`${POPUP} .chip b`);
  await page.click(`${POPUP} .btn.primary`);
  await page.waitForFunction((popup) => document.querySelector(`${popup} .para.done`)?.textContent === 'Paint loaded.', POPUP);
  const after = await paintedKeys(page);
  await page.evaluate(() => window.game.hud.menu.goBack());
  return after === before && chip === 'menu.rhhpaint' ? null : JSON.stringify({ painted: after, saved: before, chip });
});

await check('upload popup: a broken file says so in red, and the paint stays', async () => {
  fs.writeFileSync(`${tmp}/broken.rhhpaint`, 'RHHPgarbage');
  const before = await paintedKeys(page);
  await page.click(UPLOAD);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${POPUP} .btn.primary`)]);
  await chooser.setFiles(`${tmp}/broken.rhhpaint`);
  await page.waitForFunction((popup) => document.querySelector(`${popup} .para.error`)?.textContent === 'Broken paint file.', POPUP);
  const kept = (await paintedKeys(page)) === before;
  await page.evaluate(() => window.game.hud.menu.goBack());
  return kept ? null : 'paint changed';
});

await check('menu: after a failed link the multiplayer page says so in red and offers COPY NETWORK LOG, which saves a file where the page has no clipboard (plain http, as on a LAN)', async () => {
  const p = await openPage(() => Object.defineProperty(navigator, 'clipboard', { value: undefined }));
  await p.evaluate(() => (window.game.input.setLocked(true), window.game.input.setLocked(false)));
  const press = (text) => p.locator('.overlay button:visible', { hasText: text }).first().click();
  await press('Multiplayer');
  const before = await p.isVisible('.net-log');
  await p.evaluate(() => window.game.net.onStatus({ state: 'failed', reason: 'timeout' }));
  const said = await p.evaluate(() => { const s = document.querySelector('.mp-status'); return [s.textContent, s.classList.contains('error')]; });
  const saved = p.waitForEvent('download', { timeout: 5000 });
  await press('Copy network log');
  const name = (await saved.catch(() => null))?.suggestedFilename();
  await p.close();
  return !before && said.join() === "The server didn't answer,true" && /^roof-network-.+\.txt$/.test(name) && !p.errors.length ? null : JSON.stringify({ before, said, name, errors: p.errors });
});

await check('menu: the NAME field keeps only Latin letters and digits as typed (a stored name too); HOST with it empty says so in red and does not connect', async () => {
  const p = await openPage((k) => localStorage.setItem(k, 'Anna K'), null, 'roofhiddenhaus.name');
  const press = (text) => p.locator('.overlay button:visible', { hasText: text }).first().click();
  await p.evaluate(() => (window.game.input.setLocked(true), window.game.input.setLocked(false)));
  await press('Multiplayer');
  await press('Host a session');
  const field = p.locator('.mp-page input >> nth=0');
  const stored = await field.inputValue();
  const typed = [];
  for (const name of ['Geo Geo', 'Geo_', 'Geo.', 'Гоша', 'Geo!@#$%']) {
    await field.fill('');
    await field.pressSequentially(name);
    typed.push(await field.inputValue());
  }
  await field.fill('');
  await press('Host');
  const said = await p.evaluate(() => { const s = document.querySelector('.mp-status'); return `${s.textContent}${s.classList.contains('error') ? '' : ' (not red)'}`; });
  const state = await p.evaluate(() => window.game.net.status.state);
  await p.close();
  const ok = stored === 'AnnaK' && typed.join() === 'GeoGeo,Geo,Geo,,Geo' && said === 'Type a name first' && state !== 'connecting' && !p.errors.length;
  return ok ? null : JSON.stringify({ stored, typed, said, state, errors: p.errors });
});

await check('saves: a sign whose text changed loses its paint (changed shape), the rest loads', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const sign = g.level.add({ type: 'sign_plate', pos: [0, 2, 30], rot: 0, text: 'STAFF ONLY' });
    const key = `p${sign.id}#0`;
    g.paint.stamp(g.paint.find(key), { rect: 0, u: 0.5, v: 0.5 }, 0.05, 1, [0, 0, 1]);
    const bytes = await g.paintFile.save();
    g.level.setText(sign.id, 'A MUCH LONGER NAME PLATE');
    const loaded = await g.paintFile.load(bytes);
    const signPainted = !!g.paint.find(key).data;
    g.level.remove(sign.id);
    return { loaded, signPainted };
  });
  return r.loaded.skipped > 0 && r.loaded.faces > 0 && !r.signPainted ? null : JSON.stringify(r);
});

await check('saves: spray in the air at LOAD lands without paint', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    g.input.setLocked(true);
    g.player.setSpawn(g.player.position.clone().set(2.4, 0, 2.95), -Math.PI / 2);
    g.player.respawn();
    g.player.pitch = -0.3;
    g.inventory.select(0);
    g.paint.clear();
    const empty = await g.paintFile.save();
    let inAir = 0;
    await steps((f) => {
      if (f === 0) g.input.button(0, true);
      if (f === 8) g.input.button(0, false);
      if (f === 8) (inAir = g.tools.spray.particles.count), g.paintFile.load(empty);
      return f === 59;
    });
    g.fixedStep.dt = 0;
    g.input.setLocked(false);
    return { inAir, painted: g.paint.surfaces.filter((s) => s.data).length };
  });
  return r.inAir > 0 && r.painted === 0 ? null : JSON.stringify(r);
});
