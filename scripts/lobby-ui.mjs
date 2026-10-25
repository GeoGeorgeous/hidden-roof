// What the multiplayer browser tests share of the menu: a test can't HOST through it (players may not, SERVER.playerHost:
// its servers run with PLAYER_HOST=1 and the page hosts through window.game), but a player JOINS through it, as a
// person does: the Multiplayer page's list, a row, the dialog's name (and a private session's code), JOIN.

/** Click the visible button of the menu with this text. */
export const press = (page, text) => page.locator('.overlay button:visible', { hasText: text }).first().click();

/** A private session of up to 4 players, started by `page`'s game as the HOST form did: at this PAINT DETAIL (texels per meter; the game's own when none), from its level's paint. */
export const hostSession = (page, name, detail) =>
  page.evaluate(([name, detail]) => window.game.net.host(name, detail ?? window.game.config.PAINT.texelsPerMeter, { name: 'Test', limit: 4, tools: ['can', 'marker', 'ladder', 'roller', 'sponge'] }), [name, detail]);

/** The Multiplayer page's list, up on `page`, and its first row of this kind ('private' or 'public'), clicked. */
async function pickSession(page, kind = 'private') {
  await press(page, 'MULTIPLAYER');
  await page.locator('.mp-page .session:not(.skeleton-row)', { hasText: kind === 'private' ? 'Private' : 'Public' }).first().click();
}

/** The open dialog: the name in it, the code of a private session in its boxes, and JOIN (pressed, once it is enabled). */
async function joinDialog(page, name, code) {
  const dialog = page.locator('.join-popup:not([hidden])');
  await dialog.locator('.name-row input').fill(name);
  if (code) {
    await dialog.locator('.code-boxes input').first().click();
    await page.keyboard.type(code.toLowerCase());
  }
  await dialog.locator('.btn.primary:not([disabled])').click();
}

/** JOIN through the menu: the list, the row, the dialog. */
export async function joinFromList(page, name, code, kind = 'private') {
  await pickSession(page, kind);
  await joinDialog(page, name, kind === 'private' ? code : undefined);
}
