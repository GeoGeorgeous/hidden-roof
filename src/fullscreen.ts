// Fullscreen + Keyboard Lock (Chromium): lets the game use Ctrl+W, Ctrl+D etc.
// without the browser closing the tab. Other browsers fall back to C for crouch.
// With the keyboard locked, Esc reaches the page instead of leaving fullscreen,
// so leaving fullscreen goes through the pause menu (exitGameFullscreen).

interface KeyboardLock {
  lock(keys?: string[]): Promise<void>;
  unlock(): void;
}

const keyboard = () => (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;

/** Call from a user gesture. Failures (not allowed / not supported) keep the game windowed. */
export async function enterGameFullscreen() {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    await keyboard()?.lock();
  } catch {
    // Not allowed or not supported: keep playing windowed.
  }
}

/** Releases the keyboard lock first, so nothing can hold the page in fullscreen. */
export async function exitGameFullscreen() {
  try {
    keyboard()?.unlock();
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

export const isFullscreen = () => !!document.fullscreenElement;
