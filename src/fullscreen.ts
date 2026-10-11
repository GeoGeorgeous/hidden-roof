// Fullscreen + Keyboard Lock (Chromium): lets the game use Ctrl+W, Ctrl+D etc.
// without the browser closing the tab. Other browsers fall back to C for crouch.
// With the keyboard locked, Esc reaches the page instead of leaving fullscreen:
// holding it leaves (the browser's own, PAUSE_MENU.escHoldMs), and so do the
// pause screen's EXIT FULLSCREEN (esc-hold.ts) and turning FORCED FULLSCREEN off.

interface KeyboardLock {
  lock(keys?: string[]): Promise<void>;
  unlock(): void;
}

const keyboard = () => (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;
/** The keyboard lock was granted (and not released since). */
let keysLocked = false;

export const isFullscreen = () => !!document.fullscreenElement;

/** Esc reaches the page, and the browser leaves fullscreen only once it's held: fullscreen with the keyboard locked. Elsewhere one press leaves. */
export const escHoldLeaves = () => keysLocked && isFullscreen();

/** Call from a user gesture. Failures (not allowed / not supported) keep the game windowed. */
export async function enterGameFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    const kb = keyboard();
    if (kb) await kb.lock();
    keysLocked = !!kb;
  } catch {
    // Not allowed or not supported: keep playing windowed.
  }
}

/** Releases the keyboard lock first, so nothing can hold the page in fullscreen. */
export async function exitGameFullscreen() {
  try {
    keyboard()?.unlock();
    keysLocked = false;
  } catch {
    // No keyboard lock to release.
  }
  if (!document.fullscreenElement) return;
  try {
    await document.exitFullscreen();
  } catch {
    // Already leaving (e.g. the browser handled Esc itself).
  }
}
