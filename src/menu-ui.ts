// The ESC menu's building blocks (style.css): elements, buttons, key hints,
// the segmented control, a page's head, setting rows and sentence case; the
// build mode, the F3 panel and screen 10 make their elements here too.
// Primary buttons answer Enter: the visible one on the open page (pause-menu.ts).

/** An element: its class (none when empty) and text. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function div(className: string, text?: string) {
  return el('div', className, text);
}

/**
 * A button: `act` on click (a file picker opens only from a click). It never
 * takes the focus, so Enter can't press it again.
 */
export function button(text: string, act: (e: MouseEvent) => void, className = '') {
  const b = el('button', className, text);
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', act);
  return b;
}

/** A key cap after a button's text: ESC, ENTER. */
export function keyHint(key: string) {
  return el('kbd', '', key);
}

/** What each primary button does: Enter runs the visible one's. */
const primaries = new WeakMap<HTMLElement, () => void>();

/**
 * A button with its key as a hint: a paper one (`primary`, Enter runs it,
 * ENTER by default), or a plain one.
 */
export function action(text: string, act: () => void, { primary = false, key = primary ? 'ENTER' : '' }: { primary?: boolean; key?: string } = {}) {
  const b = button(text, act, primary ? 'btn primary' : 'btn');
  if (key) b.append(keyHint(key));
  if (primary) primaries.set(b, act);
  return b;
}

/** Sets a button's text, keeping its key hint. */
export function relabel(b: HTMLElement, text: string) {
  b.firstChild!.textContent = text;
}

/** Runs the primary button showing in `root`, if any: Enter. */
export function runPrimary(root: HTMLElement) {
  for (const b of root.querySelectorAll<HTMLElement>('.btn.primary')) {
    if (b.checkVisibility()) return primaries.get(b)!(), true;
  }
  return false;
}

/** A row of choices, one of them on (`set`); `pick` gets the index clicked. */
export function segmented(labels: string[], pick: (i: number) => void) {
  const box = div('seg');
  const items = labels.map((l, i) => {
    const b = button(l, () => pick(i));
    box.append(b);
    return b;
  });
  return { el: box, set: (on: number) => items.forEach((b, i) => b.classList.toggle('on', i === on)) };
}

/** A popup over the blurred game (a page of the menu): its title (`head`), a body and a row of buttons, refilled per state. */
export function popup(title: string) {
  const root = div('page popup-page');
  const box = div('popup');
  const head = div('popup-title', title);
  const body = div('popup-body');
  const buttons = div('popup-buttons');
  box.append(head, body, buttons);
  root.append(box);
  return { root, head, body, buttons };
}

/** A paragraph from text and highlighted bits (`[text]` elements made with `hl`); `className`: lead (larger), error. */
export function para(className: string, ...parts: (string | HTMLElement)[]) {
  const p = div(`para ${className}`);
  p.append(...parts);
  return p;
}

/** A message in a bordered box (style.css, .notice): a failure (`error`: red border, its `title` in red) or a plain note; `actions` (buttons) on its right. */
export function notice(text: string, { error = false, title, actions = [] }: { error?: boolean; title?: string; actions?: HTMLElement[] } = {}) {
  const box = div(error ? 'notice error' : 'notice');
  const body = div('notice-body');
  if (title) body.append(div('notice-title', title));
  body.append(div('notice-text', text));
  box.append(body, ...actions);
  return box;
}

/** A highlighted bit of a paragraph: a file name, a menu path. */
export function hl(text: string) {
  return el('span', 'hl', text);
}

/** A file: its name, and what's known about it (size, date) on the right. */
export function fileChip(name: string, about: string) {
  const box = div('chip');
  box.append(el('b', '', name), el('span', '', about));
  return box;
}

/** "~2 MB", "~340 KB". */
export function aboutSize(bytes: number) {
  const mb = bytes / 1048576;
  return mb >= 1 ? `~${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB` : `~${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** "NEW MANGA", "new manga" -> "New manga". */
export function sentence(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Performance cost after a setting's name: one dot (LOW) to three (HIGH). */
const COST_DOTS = { LOW: '●○○', MEDIUM: '●●○', HIGH: '●●●' };

/** A page's title, centered at the top, with what goes under it (the tabs, a subtitle). */
export function pageHead(title: string, ...under: HTMLElement[]) {
  const box = div('page-head');
  box.append(div('page-title', title), ...under);
  return box;
}

/** A row: its name (and cost), the control on the right, then its description and callout. */
export function settingRow(label: string, control: HTMLElement, { desc, note, cost }: { desc?: string; note?: string; cost?: keyof typeof COST_DOTS } = {}) {
  const box = div('setting-row');
  const line = div('line');
  const name = div('label');
  name.append(el('span', '', label));
  if (cost) name.append(Object.assign(el('span', 'cost', COST_DOTS[cost]), { title: `Performance cost: ${cost.toLowerCase()}` }));
  line.append(name, control);
  box.append(line);
  if (desc) box.append(div('desc', desc));
  if (note) box.append(div('note', note));
  return box;
}

/** ‹ value ›: `step` goes to the next value (+1) or the previous (-1); `locked`: greyed out, the arrows do nothing. */
export function choice(value: () => string, step: (d: number) => void, locked?: () => boolean) {
  const box = div('choice');
  const out = div('value');
  const go = (d: number) => () => {
    if (locked?.()) return;
    step(d);
    sync();
  };
  const sync = () => {
    out.textContent = value();
    box.classList.toggle('locked', !!locked?.());
  };
  box.append(button('‹', go(-1)), out, button('›', go(1)));
  sync();
  return { el: box, sync };
}

/** The slider over a gray tick at its default (none when that is off the scale); the debug panel's sliders too. */
export function withDefaultTick(input: HTMLInputElement, d: unknown, min: number, max: number) {
  const box = el('span', 'slider');
  if (typeof d === 'number' && d >= min && d <= max) {
    const tick = el('i');
    tick.style.setProperty('--at', String((d - min) / (max - min)));
    box.append(tick);
  }
  box.append(input);
  return box;
}
