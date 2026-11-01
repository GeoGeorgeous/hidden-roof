import { msg } from './messages';
import { div } from './menu-ui';

// The page about the game (index.html's .about) over the paused game: the pause
// menu's About → Game opens it as a circle growing from that item, a hole in
// the wall onto the site (boot.css, html.about-open). It is one of the menu's
// pages, so Esc and BACK close it as any page (the circle shrinks back into the
// item); its own button goes into the game (Start the game on the title screen),
// the circle shrinking into it, in fullscreen only if it was (not FORCED
// FULLSCREEN's call).
// Nothing reloads: the session and the paint stay as they are.

const root = document.documentElement;
/** Back into the game, the pause menu stays hidden at most this long (ms) for the pointer lock to come. */
const LOCK_WAIT = 1500;

export class AboutPortal {
  /** The menu's page for it: it holds nothing, the page about the game is index.html's. A popup page: no BACK button. */
  readonly el = div('popup-page');
  private page = document.querySelector<HTMLElement>('.about')!;
  /** Going back into the game: the pointer lock is on its way. */
  private entering = false;

  /** `enter`: its button, back into the game. */
  constructor(enter: () => void) {
    const button = this.page.querySelector<HTMLElement>('.enter')!;
    button.addEventListener('click', (e) => {
      e.preventDefault();
      this.aim(button);
      this.entering = true;
      enter();
    });
    // Closed once the circle is gone.
    this.page.addEventListener('transitionend', (e) => e.target === this.page && !this.page.classList.contains('open') && this.closed());
  }

  /** Opens, growing from where it was last aimed (aim); its button starts the game, or goes back into it once `started`. */
  open(started: boolean) {
    this.page.querySelector<HTMLElement>('.enter')!.textContent = msg(started ? 'menu.aboutBack' : 'menu.aboutStart');
    root.classList.add('about-open');
    this.page.scrollTop = 0;
    // The closed circle is laid out first, so the change to open is a transition.
    void this.page.offsetWidth;
    this.page.classList.add('open');
    this.page.querySelector<HTMLElement>('.enter')!.focus({ preventScroll: true });
  }

  /** Closes into where it last grew from or was left by. */
  close() {
    this.page.classList.remove('open');
    // No transition (reduced motion): closed at once.
    if (getComputedStyle(this.page).transitionDuration === '0s') this.closed();
  }

  /**
   * The circle is gone. Back into the game, the pointer lock may come later than that (the first time, as the browser
   * says how to leave it): the pause menu stays hidden until it does, or is refused, so it doesn't flash up meanwhile.
   */
  private closed() {
    const done = () => root.classList.remove('about-open');
    const entering = this.entering;
    this.entering = false;
    if (!entering || document.pointerLockElement) return done();
    const timer = setTimeout(settle, LOCK_WAIT);
    function settle() {
      clearTimeout(timer);
      document.removeEventListener('pointerlockchange', settle);
      document.removeEventListener('pointerlockerror', settle);
      done();
    }
    document.addEventListener('pointerlockchange', settle);
    document.addEventListener('pointerlockerror', settle);
  }

  /** It grows from and shrinks into the middle of `e`: measured while `e` shows (the menu hides its screen as the page opens). */
  aim(e: HTMLElement) {
    const r = e.getBoundingClientRect();
    this.page.style.setProperty('--portal', `${Math.round(r.x + r.width / 2)}px ${Math.round(r.y + r.height / 2)}px`);
  }
}
