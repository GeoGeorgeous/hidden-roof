import { NOTIFY } from './config';
import { msg } from './messages';
import { el } from './menu-ui';
import type { Dialogue } from './notify';

// The dialogue: a card in the middle of the screen with a label, a title, a text, an optional error to copy and one button;
// the game dims under it. Text nodes only (an error's text comes from anywhere). The notify view draws it for the dialogues
// notify.ts holds (`DialogueView`); the frame guard draws the same card by itself (`dialogueLayer`), because the frame loop
// that updates the notify view may be what broke. Enter presses the button and Esc leaves (play-state.ts); the key caps say so.

/** The dimming and the card, for a layer. `press`: the button's click (with the mouse free). */
export function dialogueLayer(d: Dialogue, press: () => void) {
  const label = el('div', 'label');
  label.append(el('i'), el('span', '', d.label));
  const button = el('button', '', d.button);
  button.addEventListener('click', press);
  const bar = el('div', 'bar');
  bar.append(button);
  const actions = el('div', 'actions');
  actions.append(bar, el('span', 'key', msg('hud.keyEnter')));
  if (d.esc) actions.append(el('span', 'esc', `${msg('hud.keyEsc')} · ${d.esc}`));
  const body = el('div', 'body');
  body.append(label, el('div', 'title', d.title), el('div', 'text', d.text));
  if (d.callout) body.append(el('pre', 'callout', d.callout));
  body.append(actions);
  const card = el('div', 'dialogue');
  card.append(body);
  return { dim: el('div', 'dim'), card };
}

/** The layer in play: it fades in and out like a chip; a dialogue that `grow`s starts as the chip with its key and becomes the card. */
export class DialogueView {
  readonly el = el('div', 'layer layer-dialogue');
  /** The card as drawn, as text (also while it fades out). */
  private shown: string | null = null;
  private timer: number | undefined;
  private press: () => void;

  constructor(press: () => void) {
    this.press = press;
  }

  /** `d`: the dialogue to show, or null for none; `chip`: the element of the chip it grows out of, if any. */
  draw(d: Dialogue | null, chip?: HTMLElement) {
    const layer = this.el;
    if (!d) {
      if (this.shown === null || this.timer !== undefined) return;
      layer.classList.remove('on');
      this.timer = window.setTimeout(() => (layer.replaceChildren(), (this.shown = null), (this.timer = undefined)), NOTIFY.chipOut);
      return;
    }
    clearTimeout(this.timer);
    this.timer = undefined;
    const text = JSON.stringify(d);
    if (text !== this.shown) {
      const fresh = this.shown === null;
      this.shown = text;
      const { dim, card } = dialogueLayer(d, this.press);
      layer.replaceChildren(dim, card);
      // Laid out once off, so the next change fades in.
      if (fresh) void layer.offsetWidth;
      if (d.grow && chip) grow(card, chip);
    }
    layer.classList.add('on');
  }
}

/**
 * The card starts as the chip's box and grows into place: position, size and corner together, the chip's content (a copy) fading out,
 * the card's fading in a little after (NOTIFY.grow*). Measured, then moved by the transition; its own styles are given back at the end.
 */
function grow(card: HTMLElement, chip: HTMLElement) {
  const from = chip.getBoundingClientRect();
  const body = card.firstElementChild as HTMLElement;
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  const ghost = el('div', 'ghost');
  ghost.append(...[...chip.children].map((c) => c.cloneNode(true)));
  card.append(ghost);
  const place = (x: number, y: number, width: number, height: number, radius: number) =>
    Object.assign(card.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px`, borderRadius: `${radius}px` });
  card.classList.add('grow');
  // The body keeps its final width, so its lines don't re-wrap on the way.
  body.style.width = `${w - 2}px`;
  body.style.opacity = '0';
  place(from.left, from.top, from.width, from.height, 6);
  void card.offsetWidth;
  const ease = NOTIFY.growEase;
  card.style.transition = ['left', 'top', 'width', 'height', 'border-radius'].map((p) => `${p} ${NOTIFY.growTime}ms ${ease}`).join(', ');
  body.style.transition = `opacity ${NOTIFY.growIn}ms ease ${NOTIFY.growDelay}ms`;
  ghost.style.transition = `opacity ${NOTIFY.growOut}ms ease`;
  place((window.innerWidth - w) / 2, (window.innerHeight - h) / 2, w, h, 8);
  body.style.opacity = '1';
  ghost.style.opacity = '0';
  window.setTimeout(() => {
    card.removeAttribute('style');
    card.classList.remove('grow');
    body.removeAttribute('style');
    ghost.remove();
  }, NOTIFY.growTime);
}
