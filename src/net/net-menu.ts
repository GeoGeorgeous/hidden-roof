import { PAINT } from '../config';
import { pickFile } from '../files';
import type { Hud } from '../hud';
import type { Hotbar } from '../inventory/hotbar';
import { savePaint } from '../save/save-paint';
import { cycle, PAINT_DETAIL } from '../settings';
import { button, div } from '../settings-page';
import { CODE_LENGTH, CODE_LETTERS, NAME_MAX } from './protocol';
import { Multiplayer, type MultiplayerContext, type NetStatus } from './multiplayer';

// The MULTIPLAYER page of the pause menu: HOST (a name, the session's PAINT
// DETAIL, the paint to start from: none, this level's as it is, or a paint
// file) or JOIN (a name and the code the host shares). In a session the menu
// shows the code and offers SAVE PAINT (the session's) and LEAVE SESSION.
// Returns the game's Multiplayer.

type Start = 'clean' | 'mine' | 'file';
const STARTS: Start[] = ['clean', 'mine', 'file'];
const START_LABEL: Record<Start, string> = { clean: 'NO PAINT', mine: 'THIS PAINT', file: 'A PAINT FILE' };
const DETAILS = Object.entries(PAINT_DETAIL) as [string, number][];
const NAME_KEY = 'roofhiddenhaus.name';

/** What the player reads about the link. */
const STATUS: Record<string, string> = {
  connecting: 'CONNECTING…',
  reconnecting: 'CONNECTION LOST · RECONNECTING…',
  version: 'A NEW VERSION IS OUT: RELOAD THE PAGE',
  'no-session': 'NO SESSION WITH THAT CODE',
  full: 'THAT SESSION IS FULL',
  'bad-save': "THAT PAINT FILE DOESN'T FIT THIS LEVEL",
  unreachable: "CAN'T REACH THE SERVER",
  ended: 'THE SESSION HAS ENDED',
};

export function multiplayerMenu(hud: Hud, hotbar: Hotbar, ctx: MultiplayerContext, levelName: () => string) {
  const net = new Multiplayer(ctx);
  const root = div('settings-page mp-page');
  const rows = div('rows');
  const status = div('mp-status');
  root.append(rows, status);

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
  let start: Start = 'clean';

  const say = (text: string) => (status.textContent = text);
  const named = () => {
    if (name.trim()) return name.trim();
    say('TYPE A NAME FIRST');
    return null;
  };
  const show = (...els: HTMLElement[]) => {
    rows.replaceChildren(...els);
    say('');
  };
  const choose = () => show(row('', button('> HOST A SESSION', host), button('> JOIN A SESSION', join), button('< BACK', () => hud.openPage(null))));
  const host = () => {
    detail = PAINT.texelsPerMeter;
    const detailRow = choice('PAINT DETAIL', () => `${DETAILS.find(([, t]) => t === detail)![0].toUpperCase()}  ${(100 / detail).toFixed(1)} CM`, (d) => (detail = cycle(DETAILS.map(([, t]) => t), detail, d)), 'Everyone in the session paints at this detail.');
    const startRow = choice('START WITH', () => START_LABEL[start], (d) => (start = cycle(STARTS, start, d)), "The paint the session starts from: none, this level's paint as it is now, or a saved paint file.");
    // A click, not mousedown: the file picker opens only from a click.
    const go = Object.assign(document.createElement('button'), { textContent: '> HOST' });
    go.addEventListener('click', async () => {
      const who = named();
      if (!who) return;
      try {
        const save = start === 'mine' ? await savePaint(ctx.paint, { name: levelName() }) : start === 'file' ? new Uint8Array(await (await pickFile('.rhhpaint')).arrayBuffer()) : undefined;
        net.host(who, detail, save);
      } catch (e) {
        say((e as Error).message);
      }
    });
    show(row('NAME', nameInput), detailRow, startRow, row('', go, button('< BACK', choose)));
  };
  const join = () => {
    const go = button('> JOIN', () => {
      const who = named();
      const code = codeInput.value.toUpperCase();
      if (who && [...code].every((c) => CODE_LETTERS.includes(c)) && code.length === CODE_LENGTH) net.join(who, code);
      else if (who) say(`THE CODE IS ${CODE_LENGTH} LETTERS`);
    });
    show(row('NAME', nameInput), row('CODE', codeInput), row('', go, button('< BACK', choose)));
  };
  hud.setMultiplayer(root, choose);

  net.onStatus = (s: NetStatus) => {
    hud.setSession(s.state === 'in' || s.state === 'reconnecting' ? s.code : null);
    const text = s.state === 'failed' ? STATUS[s.reason] : STATUS[s.state];
    say(text ?? '');
    if (text) hud.notice(text, s.state === 'connecting' || s.state === 'reconnecting' ? Infinity : undefined);
    else if (s.state === 'in') hud.notice(`SESSION · ${s.code}`, 0);
  };
  net.onPlayer = (who, joined) => hotbar.toast(`${who} ${joined ? 'joined' : 'left'}`);
  hud.onLeave = () => net.leave();
  // SAVE PAINT in a session downloads the session's paint, from the server.
  const local = hud.onSavePaint;
  hud.onSavePaint = () => (net.inSession ? net.requestSave() : local());
  return net;
}

function row(label: string, ...els: HTMLElement[]) {
  const el = div('setting-row');
  const line = div('line');
  if (label) line.append(Object.assign(div('label'), { textContent: label }));
  else line.classList.add('actions');
  line.append(...els);
  el.append(line);
  return el;
}

function choice(label: string, value: () => string, step: (d: number) => void, desc: string) {
  const out = div('choice');
  const sync = () => (out.textContent = value());
  const el = row(label, button('<', () => (step(-1), sync())), out, button('>', () => (step(1), sync())));
  el.append(Object.assign(div('desc'), { textContent: desc }));
  sync();
  return el;
}

function textInput(value: string, max: number, onInput: (v: string) => void) {
  const input = Object.assign(document.createElement('input'), { type: 'text', value, maxLength: max, spellcheck: false });
  input.addEventListener('input', () => onInput(input.value));
  return input;
}
