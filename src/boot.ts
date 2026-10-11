// The page's entry: the game (main.ts), or screen 10 (small-screen.ts) where
// it can't be played: a window smaller than RENDER.minViewport, or a device
// with no mouse to lock (a phone, a tablet without one). Both are imported
// only once chosen, so a phone loads none of the game: no three.js, level,
// textures, audio or WebSocket. ?force=1 loads the game anyway (the tests'
// small windows). index.html's inline script decides the same, to fetch the
// game's files with the page: change both together.

const force = new URLSearchParams(location.search).has('force');

/** The game can be played here: a pointer to lock, and a window big enough. */
function playable() {
  const touchOnly = matchMedia('(pointer: coarse) and (hover: none)').matches;
  const lock = 'requestPointerLock' in Element.prototype;
  return !touchOnly && lock && innerWidth >= __MIN_VIEWPORT__.w && innerHeight >= __MIN_VIEWPORT__.h;
}

if (force || playable()) import('./main');
else import('./small-screen').then((s) => s.smallScreen(playable));
