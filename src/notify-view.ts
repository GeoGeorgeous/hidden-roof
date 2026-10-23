import { NOTIFY } from './config';
import { label } from './input';
import { el } from './menu-ui';
import { DialogView } from './dialog-view';
import { resolveLine } from './messages';
import type { StatusIcon, Notify } from './notify';

// What notify.ts holds, drawn in play (style.css, "In-game messages"): the hint
// and the toasts cut in and out; the dark gradient behind a hint, the statuses and the dialog fade.
// Four layers under body: the gradient (--z-shade), the hint (--z-hint),
// toasts with statuses (--z-toast), and the dialog with its dimming (--z-dialog; dialog-view.ts). Redrawn only when `Notify.version` changes.

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

/** A status on screen: its element, its text now, and the timer that removes it once faded out. */
interface StatusBox {
  el: HTMLElement;
  icon: HTMLElement;
  text: HTMLElement;
  shown: string;
  shownIcon: StatusIcon | '';
  leaving?: number;
}

export class NotifyView {
  private shade = el('div', 'layer-shade');
  private hint = el('div', 'layer layer-hint');
  private bottom = el('div', 'layer layer-toast');
  private toasts = el('div', 'toasts');
  private statuses = el('div', 'statuses');
  private dialogView: DialogView;
  private statusByKey = new Map<string, StatusBox>();
  private seen = -1;
  /** The hint's text as drawn, key names in: they follow rebinding and the keyboard layout, which don't signal. */
  private hintShown = '';

  constructor(private notify: Notify) {
    this.dialogView = new DialogView(() => notify.confirm(true));
    this.syncLook();
    this.bottom.append(this.toasts, this.statuses);
    document.body.append(this.shade, this.hint, this.bottom, this.dialogView.el);
  }

  /** NOTIFY's look and fades as CSS variables: at start, and again when F3 changes them. */
  syncLook() {
    const css = document.documentElement.style;
    const vars: Record<string, string> = {
      'fade-in': `${NOTIFY.fadeIn}ms`,
      'fade-out': `${NOTIFY.fadeOut}ms`,
      'hint-bottom': `${NOTIFY.hintBottom}px`,
      'note-size': `${NOTIFY.fontSize}px`,
      'note-line': `${NOTIFY.lineHeight}px`,
      'note-padx': `${NOTIFY.padX}px`,
      'note-pady': `${NOTIFY.padY}px`,
      'box-opacity': `${NOTIFY.boxOpacity}`,
      'shade-height': `${NOTIFY.shadeHeight}px`,
      'shade-strength': `${NOTIFY.shadeStrength}`,
      'toast-gap': `${NOTIFY.toastGap}px`,
      'status-top': `${NOTIFY.statusTop}px`,
      'bars-loop': `${NOTIFY.barsLoop}ms`,
      'bars-step': `${NOTIFY.barsStep}ms`,
      'flicker-loop': `${NOTIFY.flickerLoop}ms`,
      'blink-loop': `${NOTIFY.blinkLoop}ms`,
    };
    for (const k in vars) css.setProperty(`--${k}`, vars[k]);
    this.seen = -1;
  }

  /** Call every frame; it draws only when something changed. */
  update() {
    const notes = this.notify.shown();
    const dialog = notes.find((n) => n.kind === 'dialog')?.dialog;
    // Under a dialog there's nothing to do in play: no hint.
    const raw = (!dialog && notes.find((n) => n.kind === 'hint')?.lines) || [];
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
    this.bottom.style.setProperty('--hint-lines', String(Math.max(1, lines.length)));
    this.toasts.replaceChildren(...notes.filter((n) => n.kind === 'toast').map((n) => box('', rich(n.lines[0]))));
    this.dialogView.draw(dialog ?? null, dialog?.grow ? this.statusByKey.get(dialog.grow)?.el : undefined);
    // A dialog takes the place of the status it replaces: that one cuts out.
    this.drawStatuses(notes.filter((n) => n.kind === 'status' && n.key !== dialog?.grow), !!dialog);
  }

  /** One box per line, each as wide as its line. The boxes are opaque in a group at the box's opacity, so where they overlap they don't darken; the text is a group above, at full strength. */
  private drawHint(lines: readonly string[]) {
    if (!lines.length) return this.hint.replaceChildren();
    const group = (className: string) => box(className, lines.map((l) => box('', rich(l))));
    this.hint.replaceChildren(box('hint-lines', [group('hint-boxes'), group('hint-text')]));
  }

  /** A status stays while its key is set, its text rewritten in place; a new one fades in, a cleared one fades out and goes. */
  private drawStatuses(notes: readonly { key: string; lines: readonly string[]; icon?: StatusIcon }[], cut: boolean) {
    const keys = new Set(notes.map((n) => n.key));
    for (const [key, status] of this.statusByKey) {
      if (keys.has(key) || status.leaving !== undefined) continue;
      status.el.classList.remove('on');
      if (cut) (status.el.remove(), this.statusByKey.delete(key));
      else status.leaving = window.setTimeout(() => (status.el.remove(), this.statusByKey.delete(key)), NOTIFY.fadeOut);
    }
    for (const { key, lines, icon } of notes) {
      let status = this.statusByKey.get(key);
      if (!status) {
        const text = el('span');
        const mark = el('i');
        status = { el: box('status', [mark, text]), icon: mark, text, shown: '', shownIcon: '' };
        this.statusByKey.set(key, status);
        this.statuses.append(status.el);
        // Laid out once off, so the next change fades in.
        void status.el.offsetWidth;
      } else if (status.leaving !== undefined) {
        clearTimeout(status.leaving);
        status.leaving = undefined;
      }
      status.el.classList.add('on');
      if ((icon ?? 'bars') !== status.shownIcon) this.drawIcon(status, (status.shownIcon = icon ?? 'bars'));
      if (lines[0] !== status.shown) status.text.replaceChildren(...rich((status.shown = lines[0])));
    }
  }

  /** Bars: three, 4, 7 and 10 px tall, the first lit (a weak link) or cycling (trying again); a red ring; a check. Drawn in CSS; a new class starts its animation, so the check pops in as it is set. */
  private drawIcon(status: StatusBox, icon: StatusIcon) {
    status.icon.className = `status-icon ${icon}`;
    status.icon.replaceChildren(...(icon === 'ring' || icon === 'check' ? [] : [el('b'), el('b'), el('b')]));
  }
}
