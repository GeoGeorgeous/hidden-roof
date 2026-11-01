import { div } from './menu-ui';

// The page about the game (index.html's .about) over the paused game: the pause
// menu's About → Game opens it as a circle growing from that item, a hole in
// the wall onto the site (boot.css, html.about-open). It is one of the menu's
// pages, so Esc and BACK close it as any page (the circle shrinks back into the
// item); its own button goes back into the game, the circle shrinking into it.
// Nothing reloads: the session and the paint stay as they are.

const root = document.documentElement;

export class AboutPortal {
  /** The menu's page for it: it holds nothing, the page about the game is index.html's. A popup page: no BACK button. */
  readonly el = div('popup-page');
  private page = document.querySelector<HTMLElement>('.about')!;

  /** `enter`: its button, back into the game. */
  constructor(enter: () => void) {
    const button = this.page.querySelector<HTMLElement>('.enter')!;
    button.addEventListener('click', (e) => {
      e.preventDefault();
      this.aim(button);
      enter();
    });
    // Closed once the circle is gone.
    this.page.addEventListener('transitionend', (e) => e.target === this.page && !this.page.classList.contains('open') && root.classList.remove('about-open'));
  }

  /** Opens, growing from where it was last aimed (aim). */
  open() {
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
    if (getComputedStyle(this.page).transitionDuration === '0s') root.classList.remove('about-open');
  }

  /** It grows from and shrinks into the middle of `e`: measured while `e` shows (the menu hides its screen as the page opens). */
  aim(e: HTMLElement) {
    const r = e.getBoundingClientRect();
    this.page.style.setProperty('--portal', `${Math.round(r.x + r.width / 2)}px ${Math.round(r.y + r.height / 2)}px`);
  }
}
