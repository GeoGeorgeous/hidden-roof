// The page's entry: the game (main.ts) where it can be played; elsewhere the
// page about the game (index.html's <main class="about">) stays, all that a
// phone, a small window or a crawler gets: a window smaller than
// RENDER.minViewport, or a device with no mouse to lock (a phone, a tablet
// without one). The game is imported only once chosen, so a phone loads none of
// it: no three.js, level, textures, audio or WebSocket. ?force=1 loads the game
// anyway (the tests' small windows). index.html's inline script decides the same
// before the first paint (html.game, which hides the page): change both
// together; this sets the class too, should that script have been blocked. The
// game starts in one tab only (one-tab.ts).

const force = new URLSearchParams(location.search).has('force');
const root = document.documentElement;

/** The game can be played here: a pointer to lock, and a window big enough. */
function playable() {
  const touchOnly = matchMedia('(pointer: coarse) and (hover: none)').matches;
  const lock = 'requestPointerLock' in Element.prototype;
  return !touchOnly && lock && innerWidth >= __MIN_VIEWPORT__.w && innerHeight >= __MIN_VIEWPORT__.h;
}

/** The game didn't start: the page about the game in its place, saying why. */
function failed() {
  const webgl = !!document.createElement('canvas').getContext('webgl2');
  root.classList.remove('game');
  const note = document.querySelector<HTMLElement>('.about .failed');
  if (!note) return;
  note.textContent = webgl ? "The game didn't load: reload the page." : 'The game needs WebGL2, and this browser has it turned off.';
  note.hidden = false;
}

// Fails when a file of the game doesn't load, or the game can't start (no WebGL: three.js throws).
if (force || playable()) {
  root.classList.add('game');
  import('./one-tab').then((t) => t.oneTab(() => import('./main'))).catch(failed);
}
