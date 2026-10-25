import { msg } from '../messages';
import { div, el } from '../menu-ui';
import { CODE_LENGTH, CODE_LETTERS } from './protocol';

// The private session's code, a box for each letter (style.css, .code-boxes): only the code's letters go in, in capitals;
// typing moves on to the next box, Backspace empties one (and, in an empty box, moves back to the one before), the arrows move, a paste fills from the box
// it lands in, and a box past the first empty one hands the focus to it.

/** What of `text` can be in the code: its letters, capitals, the code's own. */
const letters = (text: string) => [...text.toUpperCase()].filter((c) => CODE_LETTERS.includes(c));

export function codeBoxes(onChange: (code: string) => void) {
  const row = div('code-boxes');
  const boxes = Array.from({ length: CODE_LENGTH }, (_, i) => {
    const box = Object.assign(el('input'), { type: 'text', maxLength: 1, autocomplete: 'off', spellcheck: false });
    box.setAttribute('aria-label', msg('lobby.codeBox', { n: i + 1 }));
    return box;
  });
  const code = () => boxes.map((b) => b.value).join('');
  const go = (i: number) => boxes[Math.max(0, Math.min(CODE_LENGTH - 1, i))].focus();
  /** `text` into the boxes from `at`; the focus on the one after the last. */
  const put = (at: number, text: string) => {
    const typed = letters(text).slice(0, CODE_LENGTH - at);
    typed.forEach((c, k) => (boxes[at + k].value = c));
    if (typed.length) go(at + typed.length);
    changed();
  };
  const changed = () => {
    boxes.forEach((b) => b.classList.toggle('filled', !!b.value));
    onChange(code());
  };
  boxes.forEach((box, i) => {
    box.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Backspace') {
        e.preventDefault();
        // A letter goes and the focus stays; in an empty box the one before goes, and the focus with it.
        if (box.value || !i) box.value = '';
        else (boxes[i - 1].value = '', go(i - 1));
        changed();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        go(i + (e.key === 'ArrowLeft' ? -1 : 1));
      } else if (e.key.length === 1) {
        // One letter replaces what is in the box (a full box takes no typing of its own).
        e.preventDefault();
        put(i, e.key);
      }
    });
    // What the keys didn't cover (a phone's keyboard, autofill): whatever got in.
    box.addEventListener('input', () => {
      const text = box.value;
      box.value = '';
      put(i, text);
    });
    box.addEventListener('paste', (e) => {
      e.preventDefault();
      put(i, e.clipboardData?.getData('text') ?? '');
    });
    box.addEventListener('focus', () => {
      const first = boxes.findIndex((b) => !b.value);
      if (first >= 0 && i > first) boxes[first].focus();
      else box.select();
    });
  });
  row.append(...boxes);
  return {
    el: row,
    get code() {
      return code();
    },
    focus: () => {
      const first = boxes.findIndex((b) => !b.value);
      go(first < 0 ? CODE_LENGTH - 1 : first);
    },
    clear: () => (boxes.forEach((b) => (b.value = '')), changed()),
    /** Fill the boxes with a code (a retry after a failed join). */
    set: (text: string) => (boxes.forEach((b) => (b.value = '')), put(0, text)),
  };
}
