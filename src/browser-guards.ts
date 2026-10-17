import { BINDINGS, BROWSER_GUARDS, type BrowserGuard } from './config';

// Cancels the browser defaults in BROWSER_GUARDS (config.ts): one listener per event type, on the window.

/** The keys play binds; mouse buttons and wheel steps aren't keys. */
export const BOUND_KEYS = new Set<string>(Object.values(BINDINGS).flat().filter((code) => !/^(Mouse|Wheel)/.test(code)));

function matches(guard: BrowserGuard, e: Event, playing: boolean) {
  if (guard.when === 'playing' && !playing) return false;
  const key = e instanceof KeyboardEvent ? e.code : undefined;
  if (guard.keys === 'bound' && !BOUND_KEYS.has(key ?? '')) return false;
  if (Array.isArray(guard.keys) && !guard.keys.includes(key ?? '')) return false;
  if (guard.ctrl) {
    const mods = e as KeyboardEvent | WheelEvent;
    if (!(mods.ctrlKey || mods.metaKey) || guard.ctrl.except.includes(key ?? '')) return false;
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
