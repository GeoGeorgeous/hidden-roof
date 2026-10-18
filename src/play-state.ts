// Play state: playing (the game has the mouse), paused behind the menu, F3's
// panel open, build mode, in a session; what the frame does in each, and what
// Esc and Enter do while paused; while joining a session (its paint still
// loading) nothing resumes. The pointer lock itself is Input's (the
// browser's, or a test's through Input.setLocked). No DOM here: tested in
// Node (scripts/play-state.test.mjs).

/** What Esc and Enter can do: the pointer lock and the pause menu. */
export interface MenuActions {
  /** Frees the mouse (with the keyboard locked the browser no longer does it on Esc). */
  release(): void;
  /** Back to the game: pointer lock, fullscreen. From a user gesture. */
  resume(): void;
  /** The pause menu shows a page (SAVE, SETTINGS…), not the pause screen. */
  page(): boolean;
  /** Back a step within the page, or to the pause screen. */
  back(): void;
  /** Runs the page's primary button. */
  primary(): void;
}

export class PlayState {
  /** The F3 panel is open (dev builds): the mouse is free for it. */
  panel = false;
  /** Build mode (dev builds). */
  building = false;
  /** The panel opened or closed. */
  onPanel: () => void = () => {};
  /** Esc went down on the pause screen: released, it resumes. */
  private escArmed = false;

  // Plain fields, not parameter properties: Node runs this file as it is (type stripping).
  private input: { readonly locked: boolean };
  private session: { readonly multiplayer: boolean; readonly joining: boolean };
  private menu: MenuActions;

  constructor(input: { readonly locked: boolean }, session: { readonly multiplayer: boolean; readonly joining: boolean }, menu: MenuActions) {
    this.input = input;
    this.session = session;
    this.menu = menu;
  }

  /** Not playing: the pointer isn't locked. */
  get paused() {
    return !this.input.locked;
  }

  /** Paused in single player the game stops; in a session it goes on without you. */
  get frozen() {
    return this.paused && !this.session.multiplayer;
  }

  /**
   * Back to the game, unless a join or HOST is still loading the session: the paint that lands replaces the one made
   * meanwhile. Every way to resume comes here (Enter, Esc, PLAY, a click on the game).
   */
  resume() {
    if (!this.session.joining) this.menu.resume();
  }

  /** For the profiler. */
  get mode() {
    return this.building ? 'build' : this.paused ? 'paused' : 'play';
  }

  setPanel(open: boolean) {
    if (open === this.panel) return;
    this.panel = open;
    this.onPanel();
  }

  /**
   * A key went down or up. True when it's the menu's (Esc; Enter on the pause
   * menu), so it isn't a game key. Esc frees the mouse while playing; paused,
   * it goes back a page, resumes with the panel open, or on the pause screen
   * resumes once released. Enter runs the page's primary button, or resumes.
   */
  key(code: string, down: boolean, repeat: boolean) {
    const locked = this.input.locked;
    if (code === 'Escape') {
      if (!down) {
        if (locked) return true;
        const resume = this.escArmed && !this.menu.page();
        this.escArmed = false;
        if (resume) this.resume();
      } else if (locked) this.menu.release();
      else if (repeat) return true;
      else if (this.panel) this.resume();
      else if (this.menu.page()) this.menu.back();
      else this.escArmed = !this.session.joining;
      return true;
    }
    if ((code !== 'Enter' && code !== 'NumpadEnter') || locked || this.panel) return false;
    if (down && !repeat) {
      if (this.menu.page()) this.menu.primary();
      else this.resume();
    }
    return true;
  }

  /** Esc held to the end: the browser left fullscreen, and its release doesn't resume. */
  disarm() {
    this.escArmed = false;
  }
}
