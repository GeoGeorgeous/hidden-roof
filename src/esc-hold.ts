import { PAUSE_MENU } from './config';
import { canLockKeys, enterGameFullscreen, escHoldLeaves, exitGameFullscreen, isFullscreen } from './fullscreen';
import { div, keyHint } from './menu-ui';

// The pause screen's fullscreen control (top right) and the hold-Esc rings.
// In fullscreen with the keyboard locked (Chromium) the browser leaves only
// once Esc is held PAUSE_MENU.escHoldMs, and leaves by itself: a ring on the
// control and one by the status line fill over that time (a CSS transition,
// style.css .holding), full as it leaves. Holding the control takes as long,
// and leaves from here. Where one Esc leaves (no keyboard lock): no rings.

/** A progress ring: its track and its fill (style.css .ring). */
export function ring() {
  const el = div('');
  el.innerHTML = '<svg class="ring" viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.5"/><circle class="fill" cx="6" cy="6" r="4.5"/></svg>';
  return el.firstChild as SVGSVGElement;
}

export class EscHold {
  /** EXIT FULLSCREEN (hold it, or Esc), or windowed FULLSCREEN. */
  readonly el: HTMLElement;
  private label: HTMLElement;
  private key: HTMLElement;
  /** When the hold began (an event's timeStamp, on performance.now()'s clock), 0 when nothing is held. */
  private since = 0;
  /** The rings are filling. */
  private filling = false;
  /** Holding the control: it leaves fullscreen when this fires. */
  private pressTimer = 0;
  /** The fullscreen state last shown (the keyboard lock comes after fullscreen, so it's read each frame). */
  private shown = '';

  /** `changed`: a hold began or ended (the status line says so). */
  constructor(
    private overlay: HTMLElement,
    private changed: () => void,
  ) {
    this.el = div('seg fs');
    const b = document.createElement('button');
    this.label = document.createElement('span');
    this.key = keyHint('ESC');
    this.key.prepend(ring());
    b.append(this.label, this.key);
    b.addEventListener('mousedown', (e) => e.preventDefault());
    // On pointerdown: windowed, the gesture fullscreen needs; in fullscreen, a hold begins.
    b.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      if (!isFullscreen()) void enterGameFullscreen();
      else if (!escHoldLeaves()) void exitGameFullscreen();
      else if (!this.since) {
        this.start(e.timeStamp);
        this.pressTimer = window.setTimeout(() => void exitGameFullscreen(), PAUSE_MENU.escHoldMs);
      }
    });
    for (const type of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(type, () => this.pressTimer && this.stop());
    this.el.append(b);
    // The first keydown only (the browser's hold starts there), whether it paused the game or came on the pause screen.
    window.addEventListener('keydown', (e) => e.code === 'Escape' && !e.repeat && escHoldLeaves() && this.start(e.timeStamp));
    window.addEventListener('keyup', (e) => e.code === 'Escape' && !this.pressTimer && this.stop());
    window.addEventListener('blur', () => this.stop());
    document.addEventListener('fullscreenchange', () => this.stop());
    this.update();
  }

  /** Esc (or the control) is held and will leave fullscreen. */
  get held() {
    return this.since > 0;
  }

  /**
   * Starts the rings once they show: partway when the hold began before
   * they did (the Esc that paused the game), so they fill as the browser
   * leaves. Called each frame, with the label kept up with fullscreen.
   */
  update() {
    this.sync();
    if (!this.since || this.filling || !this.el.checkVisibility()) return;
    this.filling = true;
    // The empty ring first (a style read), so the fill transitions from it.
    getComputedStyle(this.key.querySelector('.fill')!).strokeDashoffset;
    this.overlay.style.setProperty('--hold-delay', `${Math.min(0, this.since - performance.now())}ms`);
    this.overlay.classList.add('holding');
  }

  private start(t: number) {
    if (this.since) return;
    this.since = t || performance.now();
    this.changed();
    this.update();
  }

  private stop() {
    clearTimeout(this.pressTimer);
    this.pressTimer = 0;
    if (!this.since) return;
    this.since = 0;
    this.filling = false;
    this.overlay.classList.remove('holding');
    this.changed();
  }

  private sync() {
    const full = isFullscreen();
    const hold = escHoldLeaves();
    // Esc resumes from the pause screen in fullscreen with the keyboard locked, and windowed where there's no keyboard
    // lock (Firefox, Safari give the pointer lock back on its release); not windowed in Chromium (it wants a click), nor in
    // fullscreen without the lock (one Esc leaves fullscreen). PLAY's ESC key shows only where it resumes.
    const resumes = hold || (!full && !canLockKeys());
    if (this.shown === `${full}${hold}${resumes}`) return;
    this.shown = `${full}${hold}${resumes}`;
    this.overlay.classList.toggle('esc-resumes', resumes);
    this.label.textContent = full ? 'Exit fullscreen' : 'Fullscreen';
    this.key.hidden = !full;
    this.key.classList.toggle('plain', !hold);
    this.el.title = !full ? 'Click to go fullscreen' : hold ? 'Hold Esc or this button to leave fullscreen' : 'Esc leaves fullscreen';
  }
}
