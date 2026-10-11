import { INK_STYLES, PAUSE_MENU } from './config';
import { creditsPage } from './credits-page';
import { EscHold, ring } from './esc-hold';
import { button, div, keyHint, runPrimary, segmented, sentence } from './menu-ui';
import { inkStyle } from './render/ink/styles';
import type { SettingSection } from './settings';
import { SettingsPage } from './settings-page';
import { updatesPage } from './updates-page';
import { VERSION } from './version';

// The ESC menu (style.css): the start / pause screen over the live game view
// (the title view before START, hud.cityView), with the style switcher, the
// fullscreen control (esc-hold.ts), PLAY and MULTIPLAYER under the title, the
// menu in three columns (paint, settings, about) and the links at its foot;
// and the pages and popups it opens over a blurred view: Settings,
// Multiplayer and the rest. Esc goes back to the pause screen, and there
// resumes once released (held, it leaves fullscreen); Enter runs the open
// page's primary button.

/** Where the GitHub link and the author's name lead. */
const REPO = 'https://github.com/GeoGeorgeous/hidden-roof';
const AUTHOR = 'https://github.com/GeoGeorgeous';
const DISCORD = 'https://discord.gg/yj8z9sxBrf';
/** Messages in the status line under the title show this long. */
const NOTICE_SECONDS = 3;
/** previewSheet shows the full pause sheet this long after the last change. */
const PREVIEW_SECONDS = 1.5;

export type Page = 'settings' | 'mp' | 'credits' | 'updates' | 'save' | 'upload';

export class PauseMenu {
  onResume = () => {};
  /** LEAVE SESSION, in a multiplayer session (net/net-menu.ts). */
  onLeave = () => {};
  /** A style picked on the switcher (INK_STYLES index). */
  onStyle = (_i: number) => {};
  readonly el: HTMLElement;
  private screen: HTMLElement;
  private back: HTMLElement;
  private status: HTMLElement;
  private hold: EscHold;
  /** Esc went down on the pause screen: released, it resumes (escapeReleased). */
  private resumeOnUp = false;
  /** The status line's message (notice), shown until noticeUntil. */
  private message = '';
  private play: HTMLElement;
  private multiplayer: HTMLElement;
  private savePaint: HTMLElement;
  private loadPaint: HTMLElement;
  private themes: ReturnType<typeof segmented>;
  private settingsPage: SettingsPage | null = null;
  private pages = new Map<Page, { el: HTMLElement; open: () => void; back?: () => boolean }>();
  private page: Page | null = null;
  /** The multiplayer session's code while in one. */
  private session: string | null = null;
  /** The game was started (past the title screen). */
  started = false;
  /** The full pause sheet is up (paused without F3, or F3 previewing it). */
  private sheetUp = false;
  private debugOpen = false;
  /** A message shows in the status line until this time (notice). */
  private noticeUntil = 0;
  /** The full sheet shows until this time (previewSheet). */
  private previewUntil = 0;
  /** The PAUSE_MENU look last applied (rewritten only on change). */
  private sheet = '';

  constructor(parent: HTMLElement) {
    this.el = div('overlay');
    this.themes = segmented(
      INK_STYLES.map((s) => sentence(s.name)),
      (i) => (this.onStyle(i), this.themes.set(inkStyle())),
    );
    this.themes.el.classList.add('themes');
    this.back = div('seg back');
    this.back.append(button('‹ Back', () => this.goBack()));
    this.back.firstChild!.appendChild(keyHint('ESC'));

    this.hold = new EscHold(this.el, () => this.sync());
    // The text, and the hold's ring beside it (left of the text, which stays centered).
    this.status = div('status');
    this.status.append(ring(), document.createElement('span'));
    // mousedown, like the canvas: the click that starts the game is the same gesture.
    this.play = Object.assign(document.createElement('button'), { className: 'play', textContent: 'Play' });
    this.play.addEventListener('mousedown', (e) => (e.preventDefault(), e.button === 0 && this.onResume()));
    this.play.append(keyHint('ESC'));
    this.multiplayer = button('Multiplayer', () => (this.session ? this.onLeave() : this.openPage('mp')));
    const start = div('start');
    start.append(this.play, this.multiplayer);
    const hero = div('hero');
    hero.append(div('title', 'Hidden Roof'), this.status, start);
    this.savePaint = item('Save', () => this.openPage('save'));
    this.loadPaint = item('Upload', () => this.openPage('upload'));
    const menu = div('menu');
    menu.append(
      column('paint', this.savePaint, this.loadPaint),
      column('settings', ...['Game', 'Graphics', 'Audio'].map((t, i) => item(t, () => this.openSettings(i)))),
      column('about', item('Updates', () => this.openPage('updates')), item('Credits', () => this.openPage('credits'))),
    );
    const foot = div('foot');
    foot.innerHTML = `<a href="${DISCORD}" target="_blank" rel="noopener">Discord</a><a href="${REPO}" target="_blank" rel="noopener">GitHub</a><i>·</i><span>${VERSION}</span><i>·</i><span>built by <a href="${AUTHOR}" target="_blank" rel="noopener">GeoGeorgeous</a></span>`;
    // The title group stands on the menu, both on the menu's line from the bottom.
    const stack = div('stack');
    stack.append(hero, menu);
    this.screen = div('pause');
    this.screen.append(stack, foot);
    this.el.append(div('blur'), this.themes.el, this.hold.el, this.screen, this.back);
    parent.append(this.el);
    this.addPage('credits', creditsPage(), () => {});
    updatesPage(this);

    // Esc held to the end: the browser left fullscreen, and its release doesn't resume.
    document.addEventListener('fullscreenchange', () => (this.resumeOnUp = false));
    window.addEventListener('keydown', (e) => {
      if (e.repeat || (e.code !== 'Enter' && e.code !== 'NumpadEnter') || this.el.hidden || this.debugOpen) return;
      if (this.page) runPrimary(this.pages.get(this.page)!.el);
      else this.onResume();
    });
    this.openPage(null);
  }

  /** Unlocked = paused: before the first start the title screen, after that the pause screen. With the debug panel open the menu stays, compact and see-through. */
  setLocked(locked: boolean, debugOpen: boolean) {
    if (locked) {
      this.started = true;
      this.openPage(null);
    }
    this.el.hidden = locked;
    this.debugOpen = debugOpen;
    this.syncCompact();
    this.sync();
  }

  /** The title screen (before START) shows a fixed view of the city (PAUSE_MENU.view); ESC later shows where you are. */
  get cityView() {
    return PAUSE_MENU.view && this.sheetUp && !this.started;
  }

  /** Esc pressed while paused: back a step; on the pause screen it resumes once released (escapeReleased). Never resumes now (false). */
  escape() {
    if (this.page) this.goBack();
    else this.resumeOnUp = true;
    return false;
  }

  /** Esc released: true when it was pressed on the pause screen and the browser didn't take it to leave fullscreen (held). */
  escapeReleased() {
    const resume = this.resumeOnUp && !this.page && !this.el.hidden;
    this.resumeOnUp = false;
    return resume;
  }

  /** Back a step within the page, or to the pause screen. */
  private goBack() {
    if (!this.page || !this.pages.get(this.page)?.back?.()) this.openPage(null);
  }

  /** Show the full pause sheet (as without F3) for a moment: F3 is tuning it (PAUSE_MENU). */
  previewSheet() {
    this.previewUntil = performance.now() + PREVIEW_SECONDS * 1000;
    this.syncCompact();
  }

  /** Shows a message in the status line for `seconds` (the toasts don't show over the menu); Infinity: until the next one. */
  notice(msg: string, seconds = NOTICE_SECONDS) {
    this.noticeUntil = performance.now() + seconds * 1000;
    this.message = msg;
    this.sync();
  }

  get inSession() {
    return !!this.session;
  }

  /** In a multiplayer session (its code) or not (null): the menu offers RESUME and LEAVE SESSION, and no UPLOAD. */
  setSession(code: string | null) {
    this.session = code;
    if (code) this.openPage(null);
    this.sync();
  }

  /** The settings page, one tab per section. */
  setSettings(sections: SettingSection[]) {
    this.settingsPage?.root.remove();
    this.settingsPage = new SettingsPage(sections);
    this.addPage('settings', this.settingsPage.root, () => this.settingsPage!.sync());
  }

  /** A page of the menu: `open` readies it each time it opens; `back` goes back a step within it (Esc, Back), false when there's none. */
  addPage(page: Page, el: HTMLElement, open: () => void, back?: () => boolean) {
    this.pages.set(page, { el, open, back });
    this.el.append(el);
    el.hidden = this.page !== page;
  }

  /** The settings page on its tab `i` (0 gameplay, 1 graphics, 2 sound). */
  openSettings(i: number) {
    this.openPage('settings');
    this.settingsPage?.show(i);
  }

  /** A page over the blurred view, or the pause screen (null). */
  openPage(page: Page | null) {
    this.page = page;
    this.el.classList.toggle('sub', !!page);
    this.screen.hidden = this.themes.el.hidden = this.hold.el.hidden = !!page;
    for (const [p, { el }] of this.pages) el.hidden = p !== page;
    // Popups have their own buttons.
    this.back.hidden = !page || !!this.pages.get(page)?.el.classList.contains('popup-page');
    if (page) this.pages.get(page)?.open();
    else this.themes.set(inkStyle());
  }

  update() {
    if (this.previewUntil && performance.now() >= this.previewUntil) {
      this.previewUntil = 0;
      this.syncCompact();
    }
    this.syncSheet();
    this.hold.update();
    if (this.noticeUntil && performance.now() >= this.noticeUntil) {
      this.noticeUntil = 0;
      this.sync();
    }
  }

  /** With F3 open the sheet is compact and lighter, unless it's being previewed. Paused without F3: no in-game UI. */
  private syncCompact() {
    const compact = this.debugOpen && performance.now() >= this.previewUntil;
    this.el.classList.toggle('compact', compact);
    // The full sheet hides the in-game UI (style.css); with F3 it stays, to tune it.
    this.sheetUp = !this.el.hidden && !compact;
    document.body.classList.toggle('paused', this.sheetUp);
  }

  private sync() {
    const idle = this.session ? `Session · ${this.session}` : this.started ? 'Paused' : 'Click to start';
    this.status.lastChild!.textContent = this.hold.held ? 'Keep holding to leave fullscreen' : performance.now() < this.noticeUntil ? this.message : idle;
    this.play.firstChild!.textContent = this.session ? 'Resume' : 'Play';
    this.multiplayer.textContent = this.session ? 'Leave session' : 'Multiplayer';
    // Nothing to save on the title screen; UPLOAD can come first. In a session, the server's paint is everyone's: no UPLOAD.
    this.savePaint.hidden = !this.started && !this.session;
    this.loadPaint.hidden = !!this.session;
  }

  /** The sheet's color and opacities, and the menu's size, from PAUSE_MENU. */
  private syncSheet() {
    const m = PAUSE_MENU;
    const sheet = `${m.color}|${m.opacity}|${m.pageOpacity}|${m.debugOpacity}|${m.scale}|${m.escHoldMs}`;
    if (sheet === this.sheet) return;
    this.sheet = sheet;
    const mix = (a: number) => `color-mix(in srgb, ${m.color} ${Math.round(Math.min(1, Math.max(0, a)) * 100)}%, transparent)`;
    this.el.style.setProperty('--sheet', mix(m.opacity));
    this.el.style.setProperty('--sheet-page', mix(m.pageOpacity));
    this.el.style.setProperty('--sheet-debug', mix(m.debugOpacity));
    this.el.style.setProperty('--menu-scale', String(m.scale));
    this.el.style.setProperty('--hold-ms', `${m.escHoldMs}ms`);
  }
}

/** A menu entry. */
function item(text: string, act: () => void) {
  return button(text, act, 'item');
}

/** A column of the menu: its title, then its entries. */
function column(title: string, ...items: HTMLElement[]) {
  const el = div('col');
  el.append(Object.assign(document.createElement('h2'), { textContent: title }), ...items);
  return el;
}
