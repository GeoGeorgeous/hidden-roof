import { PAINT } from '../config';
import { download, pickFile, stamp } from '../files';
import type { PauseMenu } from '../pause-menu';
import type { Hotbar } from '../inventory/hotbar';
import { savePaint } from '../save/save-paint';
import { cycle, PAINT_DETAIL, paintDetailName } from '../settings';
import { button, div } from '../menu-ui';
import { choice, pageHead, settingRow } from '../settings-page';
import { CODE_LENGTH, CODE_LETTERS, NAME_MAX } from './protocol';
import { Multiplayer, type MultiplayerContext, type NetStatus } from './multiplayer';

// The MULTIPLAYER page of the pause menu: HOST (a name, the session's PAINT
// DETAIL, the paint to start from: the level's own (save/level-paint.ts, none
// for most levels), this level's as it is, or a paint file) or JOIN (a name
// and the code the host shares). In a session the menu shows the code and
// offers SAVE PAINT (the session's) and LEAVE SESSION. Returns the game's
// Multiplayer.

type Start = 'fresh' | 'mine' | 'file';
const STARTS: Start[] = ['fresh', 'mine', 'file'];
const START_LABEL: Record<Start, string> = { fresh: 'FRESH LEVEL', mine: 'THIS PAINT', file: 'A PAINT FILE' };
const DETAILS = Object.entries(PAINT_DETAIL) as [keyof typeof PAINT_DETAIL, number][];
const NAME_KEY = 'roofhiddenhaus.name';

/** What the player reads about the link. */
const STATUS: Record<string, string> = {
  connecting: 'CONNECTING…',
  reconnecting: 'CONNECTION LOST · RECONNECTING…',
  version: 'A NEW VERSION IS OUT: RELOAD THE PAGE',
  'no-session': 'NO SESSION WITH THAT CODE',
  full: 'THAT SESSION IS FULL',
  'bad-save': "THAT PAINT FILE DOESN'T FIT THIS LEVEL",
  'bad-level': "THIS LEVEL CAN'T BE HOSTED",
  busy: 'THE SERVER IS FULL: TRY AGAIN LATER',
  replaced: 'THIS SESSION WAS OPENED IN ANOTHER TAB',
  'too-many': 'TOO MANY CONNECTIONS FROM YOUR NETWORK: TRY AGAIN LATER',
  ended: 'THE SESSION HAS ENDED',
  timeout: "THE SERVER DIDN'T ANSWER",
  offline: "CAN'T REACH THE SITE: CHECK YOUR CONNECTION",
  'server-down': 'THE GAME SERVER IS DOWN',
  'no-server': 'NO GAME SERVER AT THIS ADDRESS',
  blocked: 'THE SERVER IS UP BUT THE CONNECTION FAILED (A PROXY, FIREWALL OR EXTENSION?)',
};

export function multiplayerMenu(hud: PauseMenu, hotbar: Hotbar, ctx: MultiplayerContext, levelName: () => string) {
  const net = new Multiplayer(ctx);
  const root = div('page mp-page');
  const rows = div('rows');
  const status = div('mp-status');
  rows.append(status);
  root.append(pageHead('multiplayer'), rows);

  let name = '';
  try {
    name = localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    // No storage: asked again next time.
  }
  const nameInput = textInput(name, NAME_MAX, (v) => {
    name = v;
    try {
      localStorage.setItem(NAME_KEY, v);
    } catch {
      // No storage.
    }
  });
  const codeInput = textInput('', CODE_LENGTH, () => {});
  codeInput.style.textTransform = 'uppercase';
  let detail = 0;
  let start: Start = 'fresh';

  const say = (text: string) => (status.textContent = text);
  const named = () => {
    if (name.trim()) return name.trim();
    say('TYPE A NAME FIRST');
    return null;
  };
  const show = (...els: HTMLElement[]) => {
    rows.replaceChildren(...els, status);
    say('');
  };
  const choose = () => show(menu(button('> HOST A SESSION', host), button('> JOIN A SESSION', join), button('> COPY NETWORK LOG', copyLog)));
  /** NAME, with what it is for. */
  const nameRow = () => settingRow('NAME', nameInput, { desc: 'Your name as a player: everyone in the session sees it over you. Not the name of the session.' });
  /** The network log to the clipboard, for a report; a file where the clipboard is out of reach (refused, or none: plain http, as on a LAN). */
  const copyLog = () => {
    const text = net.log.text();
    const done = (how: string) => (say(how), hud.notice(how));
    (navigator.clipboard?.writeText(text) ?? Promise.reject()).then(
      () => done('NETWORK LOG COPIED'),
      () => (download(new Blob([text], { type: 'text/plain' }), `roof-network-${stamp(new Date())}.txt`), done('NETWORK LOG SAVED AS A FILE')),
    );
  };
  const host = () => {
    detail = PAINT.texelsPerMeter;
    const detailRow = settingRow('PAINT DETAIL', choice(() => paintDetailName(DETAILS.find(([, t]) => t === detail)![0]), (d) => (detail = cycle(DETAILS.map(([, t]) => t), detail, d))).el, { desc: 'Everyone in the session paints at this detail.' });
    const startRow = settingRow('START WITH', choice(() => START_LABEL[start], (d) => (start = cycle(STARTS, start, d))).el, { desc: "The paint the session starts from: the level as it comes (its hints, if it has any), this level's paint as it is now, or a saved paint file." });
    // A click, not mousedown: the file picker opens only from a click.
    const go = Object.assign(document.createElement('button'), { textContent: '> HOST' });
    go.addEventListener('click', async () => {
      const who = named();
      if (!who) return;
      try {
        if (start === 'mine') say('PACKING PAINT…');
        const save = start === 'mine' ? await savePaint(ctx.paint, { name: levelName() }) : start === 'file' ? new Uint8Array(await (await pickFile('.rhhpaint')).arrayBuffer()) : (ctx.levelPaint() ?? undefined);
        net.host(who, detail, save);
      } catch (e) {
        say((e as Error).message);
      }
    });
    show(nameRow(), detailRow, startRow, menu(go, button('< BACK', choose)));
  };
  const join = () => {
    const go = button('> JOIN', () => {
      const who = named();
      const code = codeInput.value.toUpperCase();
      if (who && [...code].every((c) => CODE_LETTERS.includes(c)) && code.length === CODE_LENGTH) net.join(who, code);
      else if (who) say(`THE CODE IS ${CODE_LENGTH} LETTERS`);
    });
    show(nameRow(), settingRow('CODE', codeInput), menu(go, button('< BACK', choose)));
  };
  hud.addPage('mp', root, choose);

  net.onStatus = (s: NetStatus) => {
    hud.setSession(s.state === 'in' || s.state === 'reconnecting' ? s.code : null);
    const known = s.state === 'failed' ? STATUS[s.reason] : STATUS[s.state];
    // What was seen (a close code, an HTTP status, tries) goes along, for reports.
    const detail = s.state === 'failed' || s.state === 'reconnecting' ? s.detail : undefined;
    const text = known && detail ? `${known} (${detail})` : known;
    say(text ?? '');
    if (text) hud.notice(text, s.state === 'connecting' || s.state === 'reconnecting' ? Infinity : undefined);
    else if (s.state === 'in') hud.notice(`Session · ${s.code}`, 0);
  };
  net.onPlayer = (who, joined) => hotbar.toast(`${who} ${joined ? 'joined' : 'left'}`);
  hud.onLeave = () => net.leave();
  // SAVE PAINT in a session downloads the session's paint, from the server.
  const local = hud.onSavePaint;
  hud.onSavePaint = () => (net.inSession ? net.requestSave() : local());
  // Each step of HOST, JOIN or SAVE as it goes, with how far along an upload or download is.
  net.onProgress = (text) => text && (say(text), hud.notice(text, Infinity));
  net.onSave = (bytes, name) => {
    if (!bytes) return hud.notice('THE SERVER IS BUSY: SAVE AGAIN LATER');
    download(new Blob([bytes as BlobPart]), `${name}-${stamp(new Date())}.rhhpaint`);
    hud.notice('Paint saved');
  };
  return net;
}

/** Buttons stacked as in the pause menu. */
function menu(...buttons: HTMLElement[]) {
  const el = div('menu');
  el.append(...buttons);
  return el;
}

function textInput(value: string, max: number, onInput: (v: string) => void) {
  const input = Object.assign(document.createElement('input'), { type: 'text', value, maxLength: max, spellcheck: false });
  input.addEventListener('input', () => onInput(input.value));
  return input;
}
