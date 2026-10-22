import { NOTIFY } from './config';
import { label } from './input';
import { el } from './menu-ui';
import { DialogueView } from './dialogue-view';
import { resolveLine, type ChipIcon, type Notify } from './notify';

// What notify.ts holds, drawn in play (style.css, "In-game messages"): the hint
// and the toasts cut in and out; the dark gradient behind a hint and the chips fade.
// Four layers under body: the gradient (--z-shade), the hint (--z-hint),
// toasts with chips (--z-event), and the dialogue with its dimming (--z-error; dialogue-view.ts). Redrawn only when `Notify.version` changes.

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
  icon: HTMLElement;
  text: HTMLElement;
  shown: string;
  shownIcon: ChipIcon | '';
  leaving?: number;
}

export class NotifyView {
  private shade = el('div', 'layer-shade');
  private hint = el('div', 'layer layer-hint');
  private events = el('div', 'layer layer-event');
  private toasts = el('div', 'toasts');
  private chips = el('div', 'chips');
  private dialogue: DialogueView;
  private chipByKey = new Map<string, Chip>();
  private seen = -1;
  /** The hint's text as drawn, key names in: they follow rebinding and the keyboard layout, which don't signal. */
  private hintShown = '';

  constructor(private notify: Notify) {
    this.dialogue = new DialogueView(() => notify.confirm(true));
    this.syncLook();
    this.events.append(this.toasts, this.chips);
    document.body.append(this.shade, this.hint, this.events, this.dialogue.el);
  }

  /** NOTIFY's look and fades as CSS variables: at start, and again when F3 changes them. */
  syncLook() {
    const css = document.documentElement.style;
    const vars: Record<string, string> = {
      'shade-in': `${NOTIFY.shadeIn}ms`,
      'shade-out': `${NOTIFY.shadeOut}ms`,
      'chip-in': `${NOTIFY.chipIn}ms`,
      'chip-out': `${NOTIFY.chipOut}ms`,
      'hint-bottom': `${NOTIFY.hintBottom}px`,
      'note-size': `${NOTIFY.fontSize}px`,
      'note-line': `${NOTIFY.lineHeight}px`,
      'note-padx': `${NOTIFY.padX}px`,
      'note-pady': `${NOTIFY.padY}px`,
      'box-opacity': `${NOTIFY.boxOpacity}`,
      'shade-height': `${NOTIFY.shadeHeight}px`,
      'shade-strength': `${NOTIFY.shadeStrength}`,
      'toast-gap': `${NOTIFY.toastGap}px`,
      'chip-top': `${NOTIFY.chipTop}px`,
      'bars-loop': `${NOTIFY.barsLoop}ms`,
      'bars-step': `${NOTIFY.barsStep}ms`,
    };
    for (const k in vars) css.setProperty(`--${k}`, vars[k]);
    this.seen = -1;
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
    this.shade.classList.toggle('on', NOTIFY.shade === 'always' || (NOTIFY.shade === 'auto' && lines.length > 0));
    // The toasts sit above the hint's top line.
    this.events.style.setProperty('--hint-lines', String(Math.max(1, lines.length)));
    this.toasts.replaceChildren(...notes.filter((n) => n.kind === 'event').map((n) => box('', rich(n.lines[0]))));
    const error = notes.find((n) => n.kind === 'error');
    this.dialogue.draw(error?.dialogue ?? null, error?.dialogue?.grow ? this.chipByKey.get(error.key)?.el : undefined);
    // A dialogue takes the place of the chip it replaces: that one cuts out.
    this.drawChips(notes.filter((n) => n.kind === 'status'), !!error);
  }

  /** One box per line, each as wide as its line. The boxes are opaque in a group at the box's opacity, so where they overlap they don't darken; the text is a group above, at full strength. */
  private drawHint(lines: readonly string[]) {
    if (!lines.length) return this.hint.replaceChildren();
    const group = (className: string) => box(className, lines.map((l) => box('', rich(l))));
    this.hint.replaceChildren(box('subtitle', [group('hint-boxes'), group('hint-text')]));
  }

  /** A chip stays while its key is set, its text rewritten in place; a new one fades in, a cleared one fades out and goes. */
  private drawChips(notes: readonly { key: string; lines: readonly string[]; icon?: ChipIcon }[], cut: boolean) {
    const keys = new Set(notes.map((n) => n.key));
    for (const [key, chip] of this.chipByKey) {
      if (keys.has(key) || chip.leaving !== undefined) continue;
      chip.el.classList.remove('on');
      if (cut) (chip.el.remove(), this.chipByKey.delete(key));
      else chip.leaving = window.setTimeout(() => (chip.el.remove(), this.chipByKey.delete(key)), NOTIFY.chipOut);
    }
    for (const { key, lines, icon } of notes) {
      let chip = this.chipByKey.get(key);
      if (!chip) {
        const text = el('span');
        const mark = el('i');
        chip = { el: box('chip', [mark, text]), icon: mark, text, shown: '', shownIcon: '' };
        this.chipByKey.set(key, chip);
        this.chips.append(chip.el);
        // Laid out once off, so the next change fades in.
        void chip.el.offsetWidth;
      } else if (chip.leaving !== undefined) {
        clearTimeout(chip.leaving);
        chip.leaving = undefined;
      }
      chip.el.classList.add('on');
      if ((icon ?? 'bars') !== chip.shownIcon) this.drawIcon(chip, (chip.shownIcon = icon ?? 'bars'));
      if (lines[0] !== chip.shown) chip.text.replaceChildren(...rich((chip.shown = lines[0])));
    }
  }

  /** Bars: three, 4, 7 and 10 px tall, the first lit (a weak link) or cycling (trying again); a red ring; a check. Drawn in CSS. */
  private drawIcon(chip: Chip, icon: ChipIcon) {
    chip.icon.className = icon;
    chip.icon.replaceChildren(...(icon === 'ring' || icon === 'check' ? [] : [el('b'), el('b'), el('b')]));
  }
}
