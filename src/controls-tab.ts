import { PAUSE_MENU, PLAYER } from './config';
import { type Action, keyName } from './input';
import { allDefault, bind, type Bound, CONTROL_GROUPS, defaultSlot, nameOf, refusal, resetKeys, restore, slots, snapshot } from './key-bindings';
import { button, div } from './menu-ui';
import { choice } from './settings-page';
import type { OwnTab } from './settings';

// Settings → Controls: every play action's two slots (key-bindings.ts), in
// groups, with Crouch's mode and Forward's tap twice to run inside their rows.
// A slot, clicked, listens: the next key, mouse button or wheel step binds to
// it, and nothing else hears it (the game, the menu, the page); Esc cancels and
// a reserved key is refused with the reason. Right-click clears a slot, Shift +
// click resets it. A key taken from another action, and Reset all, can be
// undone for PAUSE_MENU.undoSeconds. The footer line says what's going on.

const HINT = 'Click a slot, then press a key, click or scroll  ·  Right-click clears  ·  Shift + click resets';
/** The window's input events a listening slot takes, before anyone else hears them. */
const EVENTS = ['keydown', 'keyup', 'mousedown', 'mouseup', 'click', 'auxclick', 'contextmenu', 'wheel'];

export class ControlsTab implements OwnTab {
  readonly rows = div('controls');
  readonly foot = div('controls-foot');
  readonly corner = div('seg reset-all');
  private status = Object.assign(document.createElement('span'), { className: 'status' });
  private undoLink = button('Undo', () => this.undo(), 'undo');
  private syncs: (() => void)[] = [];
  /** The slot listening, and why the last key was refused. */
  private listening: { action: Action; i: number; refused: string | null } | null = null;
  /** Bound: the input's release (keyup, mouseup and its click) is still swallowed. */
  private ending = false;
  /** A moved key's or Reset all's message, and the slots to undo to. */
  private notice: { text: string; undo: Bound } | null = null;
  private noticeTimer = 0;
  /** Reset all asks first. */
  private asking = false;

  /** `changed`: a binding or a setting changed, to save. */
  constructor(private changed: () => void) {
    for (const group of CONTROL_GROUPS) {
      this.rows.append(div('group', group.name));
      for (const { action, name, desc } of group.rows) {
        const sub = action === 'crouch' ? this.mode('Mode', () => (PLAYER.crouchToggle ? 'Toggle' : 'Hold'), () => (PLAYER.crouchToggle = !PLAYER.crouchToggle)) : action === 'forward' ? this.mode('Tap twice to run', () => (PLAYER.tapToRun ? 'Yes' : 'No'), () => (PLAYER.tapToRun = !PLAYER.tapToRun)) : null;
        this.rows.append(this.row(action, name, desc, sub));
      }
    }
    this.undoLink.hidden = true;
    this.foot.append(this.status, this.undoLink);
    this.syncs.push(() => this.syncCorner());
    for (const type of EVENTS) window.addEventListener(type, this.take, { capture: true, passive: false });
  }

  open() {
    this.stopListening();
    this.asking = false;
    this.notice = null;
    this.sync();
  }

  close() {
    this.stopListening();
  }

  /** An action's row: its name (No key when it has none) and description, its two slots, and a line inside it (`sub`). */
  private row(action: Action, name: string, desc: string | undefined, sub: HTMLElement | null) {
    const el = div('control-row');
    const line = div('line');
    const text = div('text');
    const head = div('label');
    const none = Object.assign(document.createElement('span'), { className: 'no-key', textContent: 'No key' });
    head.append(Object.assign(document.createElement('span'), { textContent: name }), none);
    text.append(head);
    if (desc) text.append(div('desc', desc));
    const buttons = [0, 1].map((i) => {
      const b = button('', (e) => this.click(action, i, e.shiftKey), 'slot');
      b.title = 'Click to bind · Right-click to clear · Shift + click to reset';
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.commit(action, i, null);
      });
      return b;
    });
    const box = div('slots');
    box.append(...buttons);
    line.append(text, box);
    el.append(line);
    if (sub) el.append(sub);
    this.syncs.push(() => {
      const s = slots(action);
      none.hidden = s.some((c) => c !== null);
      buttons.forEach((b, i) => {
        const on = this.listening?.action === action && this.listening.i === i;
        b.textContent = on ? 'Press a key' : s[i] ? keyName(s[i]) : '—';
        b.classList.toggle('listening', on);
        b.classList.toggle('refused', on && !!this.listening?.refused);
        b.classList.toggle('empty', !s[i]);
      });
    });
    return el;
  }

  /** A line inside a row: a ‹ value › chooser across both slots, either arrow flips it. */
  private mode(name: string, value: () => string, flip: () => void) {
    const el = div('sub');
    const c = choice(value, () => (flip(), this.changed()));
    el.append(div('desc', name), c.el);
    this.syncs.push(c.sync);
    return el;
  }

  private click(action: Action, i: number, shift: boolean) {
    this.asking = false;
    if (shift) this.commit(action, i, defaultSlot(action, i));
    else this.listening = { action, i, refused: null };
    this.sync();
  }

  /** Binds and saves; a key taken from another action says so, with Undo. */
  private commit(action: Action, i: number, code: string | null) {
    const before = snapshot();
    const from = bind(action, i, code);
    if (from) this.say(`${keyName(code!)} moved here from ${nameOf(from)}${slots(from).some((c) => c !== null) ? '' : ', which has no key now'}.`, before);
    this.changed();
    this.sync();
  }

  /** Every input while a slot listens, and the release of the one it bound. */
  private take = (e: Event) => {
    if (!this.listening && !this.ending) return;
    // The page went (a session started): nothing listens.
    if (!this.rows.checkVisibility()) return this.stopListening();
    const listening = this.listening;
    if (!listening) {
      // Bound: only the release goes. Anything else ends it and is heard as usual.
      if (!['keyup', 'mouseup', 'click', 'auxclick', 'contextmenu'].includes(e.type)) return this.stopListening();
      if (e.type === 'keyup') this.stopListening();
      if (e.type === 'mouseup') setTimeout(() => this.stopListening());
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!listening) return;
    let code: string | null = null;
    if (e instanceof KeyboardEvent && e.type === 'keydown' && !e.repeat) {
      if (e.code === 'Escape') return this.bound(null, true);
      code = e.code;
    } else if (e instanceof WheelEvent && e.deltaY) code = e.deltaY < 0 ? 'WheelUp' : 'WheelDown';
    else if (e instanceof MouseEvent && e.type === 'mousedown') code = `Mouse${e.button}`;
    if (!code) return;
    listening.refused = refusal(code, listening.action);
    if (listening.refused) return this.sync();
    this.bound(code, !(e instanceof WheelEvent));
  };

  /** The listening slot takes `code` (null: Esc, nothing); `release`: its keyup or mouseup is still to come. */
  private bound(code: string | null, release: boolean) {
    const { action, i } = this.listening!;
    this.listening = null;
    this.ending = release;
    if (code) this.commit(action, i, code);
    else this.sync();
  }

  private stopListening() {
    this.ending = false;
    if (!this.listening) return;
    this.listening = null;
    this.sync();
  }

  private say(text: string, undo: Bound) {
    clearTimeout(this.noticeTimer);
    this.notice = { text, undo };
    this.noticeTimer = window.setTimeout(() => ((this.notice = null), this.sync()), PAUSE_MENU.undoSeconds * 1000);
  }

  private undo() {
    if (!this.notice) return;
    restore(this.notice.undo);
    this.notice = null;
    this.changed();
    this.sync();
  }

  /** Reset all: dimmed when everything is default; asks first. */
  private syncCorner() {
    if (this.asking) {
      const ask = Object.assign(document.createElement('span'), { className: 'ask', textContent: 'Reset all controls?' });
      const reset = button('Reset', () => {
        const before = snapshot();
        this.asking = false;
        resetKeys();
        this.say('Controls are back to defaults.', before);
        this.changed();
        this.sync();
      }, 'confirm');
      this.corner.replaceChildren(ask, reset, button('Cancel', () => ((this.asking = false), this.sync()), 'cancel'));
      return;
    }
    const all = button('Reset all', () => {
      if (allDefault()) return;
      this.asking = true;
      this.sync();
    });
    all.classList.toggle('dim', allDefault());
    this.corner.replaceChildren(all);
  }

  private sync() {
    for (const s of this.syncs) s();
    const l = this.listening;
    const notice = !l && this.notice;
    this.status.textContent = l ? (l.refused ? `${l.refused} Try another key.` : `Press a key, click a mouse button or scroll to bind ${nameOf(l.action)}. Esc cancels.`) : notice ? notice.text : HINT;
    this.status.className = `status${l ? (l.refused ? ' error' : ' listening') : notice ? ' notice' : ''}`;
    this.undoLink.hidden = !notice;
  }
}
