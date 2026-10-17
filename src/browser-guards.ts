import { BINDINGS, BROWSER_GUARDS, type BrowserGuard } from './config';

// Cancels the browser defaults in BROWSER_GUARDS (config.ts): one listener per event type, on the window.

/** The keys play binds (mouse buttons and wheel steps aren't keys): game fullscreen locks them from the browser (fullscreen.ts). */
export const BOUND_KEYS = new Set<string>(Object.values(BINDINGS).flat().filter((code) => !/^(Mouse|Wheel)/.test(code)));

const withCtrl = (e: Event) => (e as KeyboardEvent | MouseEvent).ctrlKey || (e as KeyboardEvent | MouseEvent).metaKey;

function matches(guard: BrowserGuard, e: Event, playing: boolean) {
  if (guard.when === 'playing' && !playing) return false;
  if (guard.ctrl && !withCtrl(e)) return false;
  if (guard.keys || guard.except) {
    if (!(e instanceof KeyboardEvent)) return false;
    const name = (withCtrl(e) ? 'Ctrl+' : '') + e.code;
    if (Array.isArray(guard.keys) && !guard.keys.includes(name)) return false;
    if (guard.except?.includes(name) || guard.except?.includes(e.code)) return false;
  }
  return !guard.buttons || (e instanceof MouseEvent && guard.buttons.includes(e.button));
}

/** Applies the table for as long as the page lives. `playing`: the mouse is the game's. */
export function guardBrowser(playing: () => boolean) {
  for (const event of new Set(BROWSER_GUARDS.map((g) => g.event))) {
    const guards = BROWSER_GUARDS.filter((g) => g.event === event);
    // Not passive, or a wheel listener couldn't cancel.
    window.addEventListener(event, (e) => guards.some((g) => matches(g, e, playing())) && e.preventDefault(), { passive: false });
  }
}
