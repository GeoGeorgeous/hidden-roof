// The ESC menu's building blocks (style.css): buttons, key hints, the
// segmented control and sentence case. Primary buttons answer Enter: the
// visible one on the open page (pause-menu.ts).

export function div(className: string, text?: string) {
  return Object.assign(document.createElement('div'), { className }, text === undefined ? {} : { textContent: text });
}

/**
 * A button: `act` on click (a file picker opens only from a click). It never
 * takes the focus, so Enter can't press it again.
 */
export function button(text: string, act: () => void, className = '') {
  const b = Object.assign(document.createElement('button'), { textContent: text, className });
  b.addEventListener('mousedown', (e) => e.preventDefault());
  b.addEventListener('click', act);
  return b;
}

/** A key cap after a button's text: ESC, ENTER. */
export function keyHint(key: string) {
  return Object.assign(document.createElement('kbd'), { textContent: key });
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
  const el = div('seg');
  const items = labels.map((l, i) => {
    const b = button(l, () => pick(i));
    el.append(b);
    return b;
  });
  return { el, set: (on: number) => items.forEach((b, i) => b.classList.toggle('on', i === on)) };
}

/** "NEW MANGA", "new manga" -> "New manga". */
export function sentence(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
