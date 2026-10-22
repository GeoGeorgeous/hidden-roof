import { NOTIFY } from './config';
import { label } from './input';
import { el } from './menu-ui';
import { resolveLine, type Notify } from './notify';

// What notify.ts holds, drawn in play (style.css, "In-game messages"): the hint
// and the toasts cut in and out; the dark gradient behind a hint and the chips fade.
// Four layers under body: the gradient (--z-shade), the hint (--z-hint),
// toasts with chips (--z-event), and the dialogue with its dimming (--z-error). Redrawn only when `Notify.version` changes.

/** Text with **bold** parts as nodes. Never HTML: names in messages come from the network. */
function rich(text: string): Node[] {
  return text.split('**').map((part, i) => (i % 2 === 0 ? document.createTextNode(part) : el('b', '', part)));
}

/** A div holding these nodes. */
function box(className: string, nodes: Node[]) {
  const d = el('div', className);
  d.append(...nodes);
  return d;
}

/** A chip on screen: its element, its text now, and the timer that removes it once faded out. */
interface Chip {
  el: HTMLElement;
  text: HTMLElement;
  shown: string;
  leaving?: number;
}

export class NotifyView {
  private shade = el('div', 'layer-shade');
  private hint = el('div', 'layer layer-hint');
  private events = el('div', 'layer layer-event');
  private toasts = el('div', 'toasts');
  private chips = el('div', 'chips');
  private dialogue = el('div', 'layer layer-dialogue');
  /** The dialogue's text while it shows (also while it fades out). */
  private dialogueShown: string | null = null;
  private dialogueTimer: number | undefined;
  private chipByKey = new Map<string, Chip>();
  private seen = -1;
  /** The hint's text as drawn, key names in: they follow rebinding and the keyboard layout, which don't signal. */
  private hintShown = '';

  constructor(private notify: Notify) {
    for (const [name, ms] of [['shade-in', NOTIFY.shadeIn], ['shade-out', NOTIFY.shadeOut], ['chip-in', NOTIFY.chipIn], ['chip-out', NOTIFY.chipOut]] as const) {
      document.documentElement.style.setProperty(`--${name}`, `${ms}ms`);
    }
    this.events.append(this.toasts, this.chips);
    document.body.append(this.shade, this.hint, this.events, this.dialogue);
  }

  /** Call every frame; it draws only when something changed. */
  update() {
    const notes = this.notify.shown();
    const raw = notes.find((n) => n.kind === 'advice')?.lines ?? [];
    const lines = raw.map((l) => resolveLine(l, label));
    const text = lines.join('\n');
    if (text !== this.hintShown) {
      this.hintShown = text;
      this.drawHint(lines);
    }
    if (this.notify.version === this.seen) return;
    this.seen = this.notify.version;
    this.shade.classList.toggle('on', lines.length > 0);
    // The toasts sit above the hint's top line.
    this.events.style.setProperty('--hint-lines', String(Math.max(1, lines.length)));
    this.toasts.replaceChildren(...notes.filter((n) => n.kind === 'event').map((n) => box('', rich(n.lines[0]))));
    const error = notes.find((n) => n.kind === 'error');
    this.drawDialogue(error?.lines[0] ?? null);
    // A dialogue takes the place of the chip it replaces: that one cuts out.
    this.drawChips(notes.filter((n) => n.kind === 'status'), !!error);
  }

  /** The dimming and a box where the chips are: a dot, the text, OK and the key that presses it (Enter, handled by play-state.ts). It fades in and out like a chip. */
  private drawDialogue(text: string | null) {
    if (text === null) {
      if (this.dialogueShown === null || this.dialogueTimer !== undefined) return;
      this.dialogue.classList.remove('on');
      this.dialogueTimer = window.setTimeout(() => (this.dialogue.replaceChildren(), (this.dialogueShown = null), (this.dialogueTimer = undefined)), NOTIFY.chipOut);
      return;
    }
    clearTimeout(this.dialogueTimer);
    this.dialogueTimer = undefined;
    if (text !== this.dialogueShown) {
      const fresh = this.dialogueShown === null;
      this.dialogueShown = text;
      this.dialogue.replaceChildren(el('div', 'dim'), box('dialogue', [el('i'), box('', rich(text)), el('span', 'ok', 'OK'), el('span', 'key', 'Enter')]));
      // Laid out once off, so the next change fades in.
      if (fresh) void this.dialogue.offsetWidth;
    }
    this.dialogue.classList.add('on');
  }

  /** One box per line, each as wide as its line. The boxes are opaque in a group at the box's opacity, so where they overlap they don't darken; the text is a group above, at full strength. */
  private drawHint(lines: readonly string[]) {
    if (!lines.length) return this.hint.replaceChildren();
    const group = (className: string) => box(className, lines.map((l) => box('', rich(l))));
    this.hint.replaceChildren(box('hint', [group('hint-boxes'), group('hint-text')]));
  }

  /** A chip stays while its key is set, its text rewritten in place; a new one fades in, a cleared one fades out and goes. */
  private drawChips(notes: readonly { key: string; lines: readonly string[]; spin?: boolean }[], cut: boolean) {
    const keys = new Set(notes.map((n) => n.key));
    for (const [key, chip] of this.chipByKey) {
      if (keys.has(key) || chip.leaving !== undefined) continue;
      chip.el.classList.remove('on');
      chip.leaving = window.setTimeout(() => (chip.el.remove(), this.chipByKey.delete(key)), cut ? 0 : NOTIFY.chipOut);
    }
    for (const { key, lines, spin } of notes) {
      let chip = this.chipByKey.get(key);
      if (!chip) {
        const text = el('span');
        chip = { el: box('chip', [el('i'), text]), text, shown: '' };
        this.chipByKey.set(key, chip);
        this.chips.append(chip.el);
        // Laid out once off, so the next change fades in.
        void chip.el.offsetWidth;
      } else if (chip.leaving !== undefined) {
        clearTimeout(chip.leaving);
        chip.leaving = undefined;
      }
      chip.el.classList.add('on');
      chip.el.classList.toggle('spin', !!spin);
      if (lines[0] !== chip.shown) chip.text.replaceChildren(...rich((chip.shown = lines[0])));
    }
  }
}
