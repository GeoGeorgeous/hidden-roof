import { NOTIFY } from './config';
import { msg } from './messages';
import { el } from './menu-ui';
import type { Dialog } from './notify';

// The dialog: a card in the middle of the screen with a label, a title, a text, an optional error to copy and one button;
// the game dims under it. Text nodes only (an error's text comes from anywhere). The notify view draws it for the dialogs
// notify.ts holds (`DialogView`); the frame guard draws the same card by itself (`dialogLayer`), because the frame loop
// that updates the notify view may be what broke. Enter presses the button and Esc leaves (play-state.ts); the key caps say so.

/** The veil and the card, for a layer. `press`: the button's click (with the mouse free). */
export function dialogLayer(d: Dialog, press: () => void) {
  const label = el('div', 'label');
  label.append(el('i'), el('span', '', d.label));
  // The button with its key cap in it, in a segmented control as in the menu; what Esc does, when that's something else, on a line of its own under it.
  const button = el('button');
  button.append(el('span', '', d.button), el('kbd', '', msg('hud.keyEnter')));
  button.addEventListener('click', press);
  const seg = el('div', 'seg');
  seg.append(button);
  const actions = el('div', 'actions');
  actions.append(seg);
  if (d.esc) {
    const esc = el('div', 'esc');
    esc.append(el('kbd', '', msg('hud.keyEsc')), el('span', '', d.esc));
    actions.append(esc);
  }
  const body = el('div', 'body');
  body.append(label, el('div', 'title', d.title), el('div', 'text', d.text));
  if (d.callout) body.append(el('pre', 'callout', d.callout));
  body.append(actions);
  const card = el('div', 'dialog');
  card.append(body);
  return { veil: el('div', 'veil'), card };
}

/** The layer in play: it fades in and out like a status; a dialog that `grow`s starts as the status it names and becomes the card. */
export class DialogView {
  readonly el = el('div', 'layer layer-dialog');
  /** The card as drawn, as text (also while it fades out). */
  private shown: string | null = null;
  private timer: number | undefined;
  private press: () => void;

  constructor(press: () => void) {
    this.press = press;
  }

  /** `d`: the dialog to show, or null for none; `status`: the element of the status it grows out of, if any. */
  draw(d: Dialog | null, status?: HTMLElement) {
    const layer = this.el;
    if (!d) {
      if (this.shown === null || this.timer !== undefined) return;
      layer.classList.remove('on');
      this.timer = window.setTimeout(() => (layer.replaceChildren(), (this.shown = null), (this.timer = undefined)), NOTIFY.fadeOut);
      return;
    }
    clearTimeout(this.timer);
    this.timer = undefined;
    const text = JSON.stringify(d);
    if (text !== this.shown) {
      const fresh = this.shown === null;
      this.shown = text;
      const { veil, card } = dialogLayer(d, this.press);
      layer.replaceChildren(veil, card);
      // Laid out once off, so the next change fades in.
      if (fresh) void layer.offsetWidth;
      if (d.grow && status) grow(card, status);
    }
    layer.classList.add('on');
  }
}

/**
 * The card starts as the status's box and grows into place: position, size and corner together, the status's content (a copy) fading out,
 * the card's fading in a little after (NOTIFY.grow*). It stays centered by its own CSS (left/top 50%, translate -50%), so only an
 * offset from the center, its size and its corner move: at the end the inline styles go and nothing jumps.
 */
function grow(card: HTMLElement, status: HTMLElement) {
  const from = status.getBoundingClientRect();
  const body = card.firstElementChild as HTMLElement;
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  const ghost = el('div', 'ghost');
  ghost.append(...[...status.children].map((c) => c.cloneNode(true)));
  card.append(ghost);
  const dx = from.left + from.width / 2 - window.innerWidth / 2;
  const dy = from.top + from.height / 2 - window.innerHeight / 2;
  const place = (x: number, y: number, width: number, height: number, radius: number) =>
    Object.assign(card.style, { transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`, width: `${width}px`, height: `${height}px`, borderRadius: `${radius}px` });
  // The body keeps its final width, so its lines don't re-wrap on the way.
  body.style.width = `${w - 2}px`;
  body.style.opacity = '0';
  card.style.transition = 'none';
  place(dx, dy, from.width, from.height, 6);
  void card.offsetWidth;
  const ease = NOTIFY.growEase;
  card.style.transition = ['transform', 'width', 'height', 'border-radius'].map((p) => `${p} ${NOTIFY.growTime}ms ${ease}`).join(', ');
  body.style.transition = `opacity ${NOTIFY.growIn}ms ease ${NOTIFY.growDelay}ms`;
  ghost.style.transition = `opacity ${NOTIFY.growOut}ms ease`;
  place(0, 0, w, h, 8);
  body.style.opacity = '1';
  ghost.style.opacity = '0';
  window.setTimeout(() => {
    // Its own transitions are off for this frame: the inline end state is the CSS one, so nothing should move anyway.
    card.style.transition = 'none';
    for (const p of ['transform', 'width', 'height', 'borderRadius'] as const) card.style[p] = '';
    void card.offsetWidth;
    card.removeAttribute('style');
    body.removeAttribute('style');
    ghost.remove();
  }, NOTIFY.growTime);
}
